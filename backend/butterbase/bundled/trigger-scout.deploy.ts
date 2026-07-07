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
// Scout agent (Butterbase Function, TS). Extracts findings from a fixed set of
// pre-picked sources and writes them into Neo4j per the LOCKED Scout contract:
//   - two measurements per technique (TOPS/W improves, Memory_MB hurts)
//   - MERGE Source/Technique/Metric on natural keys; CREATE Finding by content hash
//   - (:Technique)-[:ADDRESSES]->(:ResearchGoal) to stay connected to the seed
// Extraction is deterministic for demo stability; swap FIXTURES for regex/Nebius later.
interface Ctx {
  env: Env;
  db: any;
  waitUntil: (p: Promise<unknown>) => void;
}

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const params = (await req.json().catch(() => ({}))) as {
    sources?: string[];
    focus_hint?: string;
  };
  const id = `job_scout_${Date.now()}`;
  const run_id = runId();

  await jobsInsert(ctx.db, { id, type: 'scout', status: 'pending', params });

  ctx.waitUntil(runScout(ctx, id, run_id, params.sources));
  return ok({ job_id: id, run_id });
}

async function runScout(ctx: Ctx, jobId: string, run_id: string, sources?: string[]) {
  const env = ctx.env;
  try {
    await jobsUpdate(ctx.db, jobId, { status: 'running' });

    const selected = sources?.length ? sources : Object.keys(FIXTURES);
    let nodes = 0;
    let edges = 0;

    for (const key of selected) {
      const src = FIXTURES[key];
      if (!src) continue;
      for (const m of src.measurements) {
        const isImproves = METRICS.topsPerWatt.name === m.metric;
        const metric = isImproves ? METRICS.topsPerWatt : METRICS.memory;
        const rel = metric.higher_is_better ? 'IMPROVES' : 'HURTS';
        const fId = await findId(src.url, m.technique, m.metric, m.value);

        await cypher(
          `MERGE (goal:ResearchGoal {id: 'goal_main'})
           MERGE (s:Source {id: $srcId})
             ON CREATE SET s.url = $url, s.title = $title, s.type = $srcType,
                           s.created_at = datetime()
           MERGE (t:Technique {id: $techId})
             ON CREATE SET t.name = $technique, t.created_at = datetime()
           MERGE (mnode:Metric {id: $metricId})
             ON CREATE SET mnode.name = $metricName, mnode.unit = $unit,
                           mnode.higher_is_better = $hib, mnode.created_at = datetime()
           MERGE (t)-[:ADDRESSES]->(goal)
           MERGE (f:Finding {id: $findId})
             ON CREATE SET f.text = $text, f.value = $value, f.unit = $unit,
                           f.metric_name = $metricName, f.raw_text = $rawText,
                           f.run_id = $runId, f.created_at = datetime()
           MERGE (f)-[:EXTRACTED_FROM]->(s)
           MERGE (f)-[:SUPPORTS]->(t)
           MERGE (t)-[r:${rel}]->(mnode)
             ON CREATE SET r.value = $value, r.unit = $unit`,
          {
            srcId: srcId(src.url),
            url: src.url,
            title: src.title,
            srcType: src.type,
            techId: techId(m.technique),
            technique: m.technique,
            metricId: metricId(m.metric),
            metricName: metric.name,
            unit: metric.unit,
            hib: metric.higher_is_better,
            findId: fId,
            text: `${m.technique}: ${m.raw_text}`,
            value: m.value,
            rawText: m.raw_text,
            runId: run_id,
          },
          env,
        );
        nodes += 1;
        edges += 3;
      }
    }

    await jobsUpdate(ctx.db, jobId, {
      status: 'done',
      result_ref: JSON.stringify({ run_id, nodes, edges }),
    });
  } catch (e) {
    await jobsUpdate(ctx.db, jobId, { status: 'error', message: String(e) });
  }
}

interface Measurement {
  technique: string;
  metric: 'TOPS/W' | 'Memory_MB';
  value: number;
  raw_text: string;
}
interface Fixture {
  url: string;
  title: string;
  type: 'paper' | 'pasted';
  measurements: Measurement[];
}

// 2-3 fixed sources, each carrying BOTH a TOPS/W and a Memory_MB figure per
// technique so the Pareto job never comes up short (per PHASE0_DECISIONS Q3).
const FIXTURES: Record<string, Fixture> = {
  'arxiv:tops-per-watt-survey': {
    url: 'https://arxiv.org/abs/tops-per-watt-survey',
    title: 'TOPS/W Survey',
    type: 'paper',
    measurements: [
      { technique: 'INT4 Quantization', metric: 'TOPS/W', value: 4.2, raw_text: 'reports 4.2 TOPS/W at 2W' },
      { technique: 'INT4 Quantization', metric: 'Memory_MB', value: 1.5, raw_text: '1.5 MB on-chip footprint' },
      { technique: 'Mixed-Precision Scheduling', metric: 'TOPS/W', value: 3.1, raw_text: '3.1 TOPS/W sustained' },
      { technique: 'Mixed-Precision Scheduling', metric: 'Memory_MB', value: 2.4, raw_text: '2.4 MB working set' },
    ],
  },
  'arxiv:edge-accelerator-thermal-2025': {
    url: 'https://arxiv.org/abs/edge-accelerator-thermal-2025',
    title: 'Edge Accelerator Thermal 2025',
    type: 'paper',
    measurements: [
      { technique: 'Structured Sparsity', metric: 'TOPS/W', value: 2.6, raw_text: '2.6 TOPS/W at iso-throughput' },
      { technique: 'Structured Sparsity', metric: 'Memory_MB', value: 0.9, raw_text: '0.9 MB after 2:4 pruning' },
    ],
  },
  'internal:memory-constrained-inference': {
    url: 'internal://memory-constrained-inference',
    title: 'Memory-Constrained Inference Notes',
    type: 'pasted',
    measurements: [
      { technique: 'Weight Streaming', metric: 'TOPS/W', value: 1.8, raw_text: '1.8 TOPS/W with DMA overlap' },
      { technique: 'Weight Streaming', metric: 'Memory_MB', value: 0.5, raw_text: '0.5 MB resident weights' },
    ],
  },
};
