import { createServer } from "node:http";
import { runAnalyzeJob } from "./batch.js";
import { toArtifact } from "./artifact.js";
import type { TechniqueInput } from "./types.js";

// Standalone HTTP server exposing the real Daytona batch job (batch.ts) so
// the RocketRide Cloud pipeline can call it as one step. @daytona/sdk needs
// Node core modules (fs, module) — confirmed it cannot run inside a
// Butterbase Function (Deno-edge runtime, fetch-only, no Node builtins) via
// an esbuild --bundle --platform=neutral smoke test, so this has to be a
// separate process, tunneled to a public URL for RocketRide to reach.
//
// Contract matches trigger-analyze.ts's expectation exactly:
// POST { jobType: 'pareto'|'ranking', data: ParetoPoint[] } -> Artifact
const PORT = Number(process.env.PORT ?? 8787);

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/run") {
    res.writeHead(404).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const parsed = JSON.parse(body) as { jobType?: "pareto" | "ranking"; data?: TechniqueInput[] };
      const jobType = parsed.jobType ?? "pareto";
      const techniques = parsed.data ?? [];
      if (!techniques.length) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({ error: "data must be a non-empty array of techniques" }),
        );
        return;
      }

      const jobId = `pipeline_${Date.now()}`;
      const job = await runAnalyzeJob(jobId, techniques);
      const artifact = toArtifact(job, jobType);

      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(artifact));
    } catch (err) {
      console.error("run failed:", err);
      res.writeHead(500, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      );
    }
  });
});

server.listen(PORT, () => {
  console.log(`Daytona job server listening on :${PORT} — POST /run`);
});
