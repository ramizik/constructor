// ---- inlined lib, bundled per-function for MCP deploy (Butterbase Functions
// run each deploy as a single isolated file — no cross-file imports). Source
// of truth for the logic is backend/butterbase/functions/_lib.ts; keep both
// in sync if the contract changes.

interface Env {
  NEO4J_QUERY_URL: string;
  NEO4J_USER: string;
  NEO4J_PASSWORD: string;
  // Organizer-mandated orchestrator between Scout and Analyst, deployed to
  // RocketRide Cloud. trigger-analyze POSTs { jobType, data } here and expects
  // an Artifact back — the pipeline starts/monitors the Daytona job now, not
  // this function directly. See docs/PROJECT_IDEA.md.
  ROCKETRIDE_PIPELINE_URL?: string;
}

interface CypherResult {
  fields: string[];
  values: unknown[][];
}

async function cypher(
  query: string,
  params: Record<string, unknown> = {},
  env: Env,
): Promise<CypherResult> {
  const res = await fetch(env.NEO4J_QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`),
    },
    body: JSON.stringify({ statement: query, parameters: params }),
  });
  const json = (await res.json()) as any;
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as CypherResult;
}

function rows<T extends Record<string, unknown>>(result: CypherResult): T[] {
  const { fields, values } = result;
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    fields.forEach((field, i) => (obj[field] = row[i]));
    return obj as T;
  });
}

function ok(data: unknown): Response {
  return Response.json(data);
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');
}
function slug(name: string): string {
  return normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const srcId = (url: string) => 'src_' + slug(url);
const techId = (name: string) => 'tech_' + slug(name);
const metricId = (name: string) => 'metric_' + slug(name);

// ---- get-run-history ---------------------------------------------------------
// Returns the trend sparkline for the right panel: one point per analyze run,
// picking the technique with the highest TOPS/W tested in that run. Frontend
// reads this as RunHistoryPoint[] (frontend/src/types.ts:129) and degrades to
// [] if 404 / exception, so this MUST always return an array (possibly empty),
// even on no-data — never 500. ROADMAP contract 2b.

interface RunHistoryPoint {
  run_id: string;
  created_at: string;
  best_technique: string;
  best_tops_w: number;
}

interface Ctx {
  env: Env;
  db: any;
  waitUntil: (p: Promise<unknown>) => void;
}

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  // One row per (run, technique) with TOPS/W; we pick the max within each run
  // in JS so we don't depend on Neo4j version-specific aggregation syntax.
  // Includes BOTH IMPROVES (positive delta on TOPS/W) and HURTS (negative) — the
  // chart just needs the number, the sign tells the analyst something extra.
  // (:ExperimentRun)-[:TESTS]->(:Technique)-[r:IMPROVES|HURTS]->(:Metric)
  // filters to the TOPS/W metric by name. Sort ASC so the sparkline reads L→R.
  const result = await cypher(
    `MATCH (run:ExperimentRun)-[:TESTS]->(t:Technique)-[r:IMPROVES|HURTS]->(m:Metric {name: 'TOPS/W'})
     RETURN run.id AS run_id, run.created_at AS created_at,
            t.name AS technique, r.value AS tops_w
     ORDER BY run.created_at ASC`,
    {},
    ctx.env,
  );

  const raw = rows<{ run_id: string; created_at: string; technique: string; tops_w: unknown }>(result);

  // Group by run_id, pick the technique with the highest TOPS/W in each run.
  const byRun = new Map<string, { created_at: string; technique: string; tops_w: number }>();
  for (const row of raw) {
    const tops = Number(row.tops_w);
    if (!Number.isFinite(tops)) continue;
    const cur = byRun.get(row.run_id);
    if (!cur || tops > cur.tops_w) {
      byRun.set(row.run_id, { created_at: row.created_at, technique: row.technique, tops_w: tops });
    }
  }

  const points: RunHistoryPoint[] = [];
  for (const [run_id, v] of byRun.entries()) {
    points.push({
      run_id,
      created_at: v.created_at,
      best_technique: v.technique,
      best_tops_w: v.tops_w,
    });
  }

  return ok(points);
}