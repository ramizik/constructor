// ---- inlined lib, bundled per-function for MCP deploy (Butterbase Functions
// run each deploy as a single isolated file — no cross-file imports). Source
// of truth for the logic is backend/butterbase/functions/_lib.ts; keep both
// in sync if the contract changes. jobs table access goes through ctx.db
// (direct Postgres) instead of the BB REST helpers the CLI-deploy path used.

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
function err(msg: string, status = 500): Response {
  return Response.json({ error: msg }, { status });
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
const runId = () => 'run_' + crypto.randomUUID();
const expId = () => 'exp_' + crypto.randomUUID();
const artifactId = () => 'artifact_' + crypto.randomUUID();

async function findId(
  sourceUrl: string,
  techniqueName: string,
  metricName: string,
  value: number | null,
): Promise<string> {
  const basis = `${sourceUrl}|${normalizeName(techniqueName)}|${normalizeName(metricName)}|${value}`;
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(basis));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return 'find_' + hex.slice(0, 16);
}

const METRICS = {
  topsPerWatt: { name: 'TOPS/W', unit: 'TOPS/W', higher_is_better: true },
  memory: { name: 'Memory_MB', unit: 'MB', higher_is_better: false },
} as const;

interface Job {
  id: string;
  type: 'scout' | 'analyze' | 'plan';
  status: 'pending' | 'running' | 'done' | 'error';
  params: Record<string, unknown>;
  result_ref?: string | null;
  message?: string | null;
  created_at: string;
}
interface Finding {
  id: string;
  text: string;
  value: number | null;
  unit: string | null;
  metric_name: string | null;
  technique?: string | null;
  source?: string | null;
  run_id?: string | null;
  created_at: string;
}
interface ParetoPoint {
  technique_id: string;
  technique: string;
  tops_w: number;
  memory_mb: number;
  higher_is_better: { tops_w: boolean; memory_mb: boolean };
}
interface ChartArtifact {
  kind: 'chart';
  title: string;
  image_url: string;
  takeaway?: string;
}
interface TableArtifact {
  kind: 'table';
  title: string;
  columns: string[];
  rows: (string | number)[][];
  takeaway?: string;
}
type Artifact = ChartArtifact | TableArtifact;

// jobs table access via ctx.db (direct Postgres client the runtime injects) —
// replaces the old BB-REST bbInsert/bbUpdate/bbGet helpers from the CLI path.
async function jobsInsert(
  db: any,
  row: { id: string; type: string; status: string; params: unknown },
) {
  await db.query('INSERT INTO jobs (id, type, status, params) VALUES ($1,$2,$3,$4)', [
    row.id,
    row.type,
    row.status,
    JSON.stringify(row.params),
  ]);
}
async function jobsUpdate(db: any, id: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await db.query(`UPDATE jobs SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}
async function jobsList(db: any): Promise<Job[]> {
  const res = await db.query('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50');
  return res.rows as Job[];
}
// Analyst agent. Pulls the two-metric payload from Neo4j, ships it to the
// RocketRide Cloud pipeline (see docs/ROADMAP.md), which starts/monitors the
// real Daytona job and hands back an artifact. ROCKETRIDE_PIPELINE_URL is
// required — there is no local/deterministic substitute. Set it via
// `manage_function update_env` (or `butterbase functions env set` on the CLI
// path) once the pipeline + relay (backend/src/rocketride/relay.ts) are up.
interface Ctx {
  env: Env;
  db: any;
  waitUntil: (p: Promise<unknown>) => void;
}

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const params = (await req.json().catch(() => ({}))) as {
    jobType?: 'pareto' | 'ranking';
    note?: string;
  };
  const id = `job_analyze_${Date.now()}`;
  await jobsInsert(ctx.db, { id, type: 'analyze', status: 'pending', params });
  ctx.waitUntil(runAnalyze(ctx, id, params.jobType ?? 'pareto'));
  return ok({ job_id: id });
}

async function runAnalyze(ctx: Ctx, jobId: string, jobType: 'pareto' | 'ranking') {
  const env = ctx.env;
  const exp_id = expId();
  const artifact_id = artifactId();
  try {
    await jobsUpdate(ctx.db, jobId, { status: 'running' });

    // Pivot the two IMPROVES/HURTS edges per technique into one row. Direction
    // (IMPROVES vs HURTS) is semantic labeling only — a technique that shrinks
    // memory footprint gets IMPROVES->Memory_MB, one that grows it gets HURTS -
    // the Pareto chart just needs the number, so match either.
    const result = await cypher(
      `MATCH (t:Technique)-[imp:IMPROVES|HURTS]->(:Metric {name: 'TOPS/W'})
       MATCH (t)-[mem:IMPROVES|HURTS]->(:Metric {name: 'Memory_MB'})
       RETURN t.id AS technique_id, t.name AS technique,
              imp.value AS tops_w, mem.value AS memory_mb`,
      {},
      env,
    );
    const points: ParetoPoint[] = rows<{
      technique_id: string;
      technique: string;
      tops_w: number;
      memory_mb: number;
    }>(result).map((r) => ({
      technique_id: r.technique_id,
      technique: r.technique,
      tops_w: Number(r.tops_w),
      memory_mb: Number(r.memory_mb),
      higher_is_better: { tops_w: true, memory_mb: false },
    }));

    const artifact = await runRocketRidePipeline(env, jobType, points);

    await cypher(
      `MERGE (run:ExperimentRun {id: $expId})
         ON CREATE SET run.created_at = datetime(), run.job_type = $jobType
       MERGE (art:ResultArtifact {id: $artifactId})
         ON CREATE SET art.title = $title, art.payload = $payload,
                       art.created_at = datetime()
       MERGE (run)-[:PRODUCES]->(art)
       WITH run
       MATCH (t:Technique) MERGE (run)-[:TESTS]->(t)`,
      {
        expId: exp_id,
        artifactId: artifact_id,
        jobType,
        title: artifact.title,
        payload: JSON.stringify(artifact),
      },
      env,
    );

    await jobsUpdate(ctx.db, jobId, { status: 'done', result_ref: artifact_id });
  } catch (e) {
    await jobsUpdate(ctx.db, jobId, { status: 'error', message: String(e) });
  }
}

// Calls the deployed RocketRide Cloud pipeline, which starts the Daytona job,
// waits on it, and returns the result. No local fallback: if the pipeline
// isn't configured or reachable, the job fails loudly (status: 'error',
// message set) instead of silently returning a fake artifact.
async function runRocketRidePipeline(
  env: Env,
  jobType: 'pareto' | 'ranking',
  points: ParetoPoint[],
): Promise<Artifact> {
  if (!env.ROCKETRIDE_PIPELINE_URL) {
    throw new Error(
      'ROCKETRIDE_PIPELINE_URL is not set on trigger-analyze. Deploy the RocketRide ' +
        'pipeline + relay (backend/src/rocketride/relay.ts) and set the env var — ' +
        'see docs/ROADMAP.md.',
    );
  }
  const res = await fetch(env.ROCKETRIDE_PIPELINE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobType, data: points }),
  });
  if (!res.ok) {
    throw new Error(`RocketRide pipeline returned ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Artifact;
}
