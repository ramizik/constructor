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
// RocketRide Cloud pipeline (organizer-mandated orchestrator, owned jointly by
// Ramis + Rohan — see docs/PROJECT_IDEA.md), which starts/monitors the actual
// Daytona job and hands back an artifact. Ranking table is the built-in
// fallback (PHASE0_DECISIONS Q3) if the pipeline isn't deployed yet.
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
// waits on it, and returns the result. Set ROCKETRIDE_PIPELINE_URL on this
// function (manage_function update_env — no redeploy needed) once the
// pipeline is built and deployed; until then this falls through below.
async function runRocketRidePipeline(
  env: Env,
  jobType: 'pareto' | 'ranking',
  points: ParetoPoint[],
): Promise<Artifact> {
  if (env.ROCKETRIDE_PIPELINE_URL) {
    const res = await fetch(env.ROCKETRIDE_PIPELINE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobType, data: points }),
    }).catch(() => null);
    if (res && res.ok) return (await res.json()) as Artifact;
  }
  return fallbackArtifact(jobType, points);
}

// Deterministic fallback so the demo never hard-fails if the pipeline isn't deployed yet.
function fallbackArtifact(jobType: 'pareto' | 'ranking', points: ParetoPoint[]): Artifact {
  if (jobType === 'ranking') {
    const ranked = [...points].sort((a, b) => b.tops_w - a.tops_w);
    return {
      kind: 'table',
      title: 'Technique Ranking — TOPS/W',
      columns: ['Technique', 'TOPS/W', 'Memory (MB)'],
      rows: ranked.map((p) => [p.technique, p.tops_w, p.memory_mb]),
      takeaway: ranked.length ? `${ranked[0].technique} leads on raw TOPS/W.` : undefined,
    };
  }
  const frontier = paretoFrontier(points);
  return {
    kind: 'chart',
    title: 'Pareto Frontier — TOPS/W (↑) vs Memory (↓)',
    image_url: paretoSvg(points, frontier),
    takeaway: frontier.length
      ? `${frontier.map((p) => p.technique).join(' & ')} dominate the efficiency/memory tradeoff.`
      : undefined,
  };
}

function paretoFrontier(pts: ParetoPoint[]): ParetoPoint[] {
  // Maximize tops_w, minimize memory_mb.
  return pts.filter(
    (p) => !pts.some((q) => q !== p && q.tops_w >= p.tops_w && q.memory_mb <= p.memory_mb &&
      (q.tops_w > p.tops_w || q.memory_mb < p.memory_mb)),
  );
}

function paretoSvg(pts: ParetoPoint[], frontier: ParetoPoint[]): string {
  const W = 420, H = 300, pad = 44;
  const xs = pts.map((p) => p.memory_mb), ys = pts.map((p) => p.tops_w);
  const xMin = Math.min(...xs, 0), xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 1);
  const sx = (v: number) => pad + ((v - xMin) / (xMax - xMin || 1)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v - yMin) / (yMax - yMin || 1)) * (H - 2 * pad);
  const fset = new Set(frontier);
  const dots = pts
    .map((p) => {
      const on = fset.has(p);
      return `<circle cx="${sx(p.memory_mb).toFixed(1)}" cy="${sy(p.tops_w).toFixed(1)}" r="${on ? 6 : 4}" fill="${on ? '#38bdf8' : '#64748b'}"/>` +
        `<text x="${(sx(p.memory_mb) + 8).toFixed(1)}" y="${(sy(p.tops_w) + 3).toFixed(1)}" fill="#cbd5e1" font-size="9">${p.technique}</text>`;
    })
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#0b0f17"/>` +
    `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#334155"/>` +
    `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="#334155"/>` +
    `<text x="${W / 2}" y="${H - 10}" fill="#94a3b8" font-size="10" text-anchor="middle">Memory (MB) →</text>` +
    `<text x="14" y="${H / 2}" fill="#94a3b8" font-size="10" text-anchor="middle" transform="rotate(-90 14 ${H / 2})">TOPS/W →</text>` +
    dots +
    `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
