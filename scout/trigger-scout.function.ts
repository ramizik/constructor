import { SOURCES } from "./sources.ts";
import { extract } from "./extract.ts";
import { buildBatch } from "./writeGraph.ts";
import { runCypher, type Neo4jConfig } from "./neo4j.ts";

// Deployed Butterbase Function: POST /v1/{app_id}/fn/trigger-scout
// Plan Phase 1 Step 3. Modal params -> jobs row -> extract+write (async) -> jobs done.
//
// ASSUMPTIONS pending confirmation, not silent — flag in team channel before deploy:
//   - Track 2: `jobs` table has columns (id, type, params jsonb, status, result_ref
//     jsonb, created_at) per ROADMAP.md. Adjust the SQL below if the real schema differs.
//   - Aura credentials arrive as Function envVars: NEO4J_QUERY_URL, NEO4J_USER,
//     NEO4J_PASSWORD (set via `deploy_function`'s envVars, never hardcoded).

interface TriggerScoutBody {
  sources?: string[]; // Source ids to run; default = all fixed sources.
  focus_hint?: string; // Unused by regex extraction; reserved for future LLM extraction.
}

interface FnContext {
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
  env: Record<string, string>;
  waitUntil: (p: Promise<unknown>) => void;
}

function neo4jConfigFrom(env: Record<string, string>): Neo4jConfig {
  const queryUrl = env.NEO4J_QUERY_URL;
  const user = env.NEO4J_USER;
  const password = env.NEO4J_PASSWORD;
  if (!queryUrl || !user || !password) {
    throw new Error(
      "Missing NEO4J_QUERY_URL / NEO4J_USER / NEO4J_PASSWORD envVars on this Function",
    );
  }
  return { queryUrl, user, password };
}

/** The actual Scout work: extract + write. Runs inside ctx.waitUntil, after response. */
async function runScout(
  db: FnContext["db"],
  cfg: Neo4jConfig,
  jobId: string,
  runId: string,
  sourceIds: string[] | undefined,
): Promise<void> {
  try {
    const chosen = sourceIds?.length
      ? SOURCES.filter((s) => sourceIds.includes(s.id))
      : SOURCES;

    const extractions = chosen.map(extract);
    const batch = buildBatch(extractions, runId);
    await runCypher(cfg, batch);

    const nodesCreated = new Set([
      ...batch.parameters.rows.map((r: any) => r.technique_id),
      ...batch.parameters.rows.map((r: any) => r.finding_id),
      ...batch.parameters.rows.map((r: any) => r.source_id),
      ...batch.parameters.rows.map((r: any) => r.metric_id),
    ]).size;

    await db.query(
      `UPDATE jobs SET status = 'done', result_ref = $1 WHERE id = $2`,
      [
        JSON.stringify({
          run_id: runId,
          nodes_touched: nodesCreated,
          edges_written: batch.parameters.rows.length * 3, // EXTRACTED_FROM+SUPPORTS+IMPROVES/HURTS
        }),
        jobId,
      ],
    );
  } catch (err) {
    await db.query(`UPDATE jobs SET status = 'error', result_ref = $1 WHERE id = $2`, [
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      jobId,
    ]);
  }
}

export default async function handler(req: Request, ctx: FnContext): Promise<Response> {
  let body: TriggerScoutBody = {};
  try {
    body = await req.json();
  } catch {
    // No body / empty body is fine — defaults apply.
  }

  const runId = "run_" + crypto.randomUUID();
  const cfg = neo4jConfigFrom(ctx.env);

  const inserted = await ctx.db.query(
    `INSERT INTO jobs (type, params, status) VALUES ('scout', $1, 'pending') RETURNING id`,
    [JSON.stringify(body)],
  );
  const jobId = inserted.rows[0].id;

  ctx.waitUntil(runScout(ctx.db, cfg, jobId, runId, body.sources));

  return new Response(JSON.stringify({ job_id: jobId, run_id: runId }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}
