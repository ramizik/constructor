import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RocketRideClient } from "rocketride";

// The deployed RocketRide pipeline's public /webhook endpoint is async-only
// (returns an ingestion ack, not the Artifact) — confirmed via direct curl,
// see docs/ROCKETRIDE_REQUIREMENTS.md §9 item 1. The SDK's session API
// (use() + send()) drives the SAME pipeline over the already-authenticated
// WebSocket connection and DOES resolve synchronously with the final
// PIPELINE_RESULT. This relay exists only because that session API needs a
// Node WS client — trigger-analyze (Deno-edge Butterbase Function) can't
// hold one, same reason the Daytona job needs server.ts as a separate
// process. Locked call graph is unchanged: trigger-analyze still POSTs
// {jobType, data} to "the RocketRide pipeline" and gets an Artifact back —
// this just fixes how that request-response actually completes.

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../..");

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

const rootEnv = readEnv(join(repoRoot, ".env"));
const pipeline = JSON.parse(readFileSync(join(repoRoot, "constructor-pipeline.pipe"), "utf-8"));

// send()/pipe.close() only returns a bare write-ack ({name, path, objectId})
// for webhook-sourced pipelines — confirmed empirically (4/4 sends completed
// server-side, zero errors, but no `answers` field ever came back through
// close()). The real synthesized output only appears on the `apaevt_flow`
// event stream (op:"end", result: PIPELINE_RESULT) — see
// .rocketride/docs/ROCKETRIDE_OBSERVABILITY.md §5.3. So: subscribe to flow
// events for our session token, fire send() to kick the run, and resolve off
// the next "end" event instead of send()'s own return value.
const pendingRuns: Array<{ resolve: (r: any) => void; reject: (e: Error) => void }> = [];

const client = new RocketRideClient({
  auth: rootEnv.ROCKETRIDE_APIKEY,
  uri: rootEnv.ROCKETRIDE_URI,
  env: rootEnv,
  persist: true,
  onEvent: async (message: any) => {
    if (message?.event !== "apaevt_flow") return;
    const body = message.body ?? {};
    if (body.op !== "end") return;
    console.log("apaevt_flow end:", JSON.stringify(body).slice(0, 500));
    const next = pendingRuns.shift();
    if (next) next.resolve(body.result);
  },
});

let sessionToken: string | null = null;
let connected = false;
let monitoring = false;

async function ensureSession(): Promise<string> {
  if (!connected) {
    await client.connect();
    connected = true;
  }
  if (!sessionToken) {
    // A prior relay process may have left a task running server-side (ttl:0
    // = no timeout). Reattach instead of calling use() again, which 500s
    // with "Pipeline is already running." for the same project_id/source.
    const existing = await client.getTaskToken({
      projectId: pipeline.project_id,
      source: pipeline.source,
    });
    if (existing) {
      sessionToken = existing;
      console.log("RocketRide reattached to existing session, token:", sessionToken);
    } else {
      const result = await client.use({ pipeline, ttl: 0 });
      sessionToken = result.token;
      console.log("RocketRide session started, token:", sessionToken);
    }
  }
  if (!monitoring) {
    await client.addMonitor({ token: sessionToken }, ["flow"]);
    monitoring = true;
  }
  return sessionToken;
}

function waitForResult(timeoutMs = 60_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = pendingRuns.findIndex((p) => p.resolve === wrappedResolve);
      if (idx !== -1) pendingRuns.splice(idx, 1);
      reject(new Error("RocketRide pipeline run timed out waiting for apaevt_flow end"));
    }, timeoutMs);
    const wrappedResolve = (r: any) => {
      clearTimeout(timer);
      resolve(r);
    };
    pendingRuns.push({ resolve: wrappedResolve, reject });
  });
}

const PORT = Number(process.env.PORT ?? 8788);

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/run") {
    res.writeHead(404).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const parsed = JSON.parse(body);
      const token = await ensureSession();

      const resultPromise = waitForResult();
      await client.send(token, JSON.stringify(parsed), {}, "application/json");
      const result = await resultPromise;

      console.log("RocketRide flow result:", JSON.stringify(result));
      const answer = (result as any)?.answers?.[0];
      if (!answer) throw new Error("RocketRide pipeline returned no answer");
      JSON.parse(answer); // validate it's real Artifact JSON before forwarding

      res.writeHead(200, { "Content-Type": "application/json" }).end(answer);
    } catch (err) {
      console.error("relay run failed:", err);
      res.writeHead(500, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      );
    }
  });
});

server.listen(PORT, () => {
  console.log(`RocketRide relay listening on :${PORT} — POST /run`);
});
