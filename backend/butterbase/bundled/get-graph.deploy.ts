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
// Whole knowledge graph as { nodes, edges } for Cytoscape.
interface Ctx {
  env: Env;
  db: any;
}

export default async function handler(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const nodeRes = await cypher(
      `MATCH (n)
       RETURN n.id AS id,
              coalesce(n.name, n.text, n.title, n.id) AS label,
              head(labels(n)) AS type`,
      {},
      ctx.env,
    );
    const edgeRes = await cypher(
      `MATCH (a)-[r]->(b)
       RETURN coalesce(r.id, toString(id(r))) AS id,
              a.id AS source, b.id AS target, type(r) AS type`,
      {},
      ctx.env,
    );
    const nodes = rows<{ id: string; label: string; type: string }>(nodeRes).map((n) => ({
      id: String(n.id),
      label: String(n.label ?? n.id),
      type: n.type,
    }));
    const edges = rows<{ id: string; source: string; target: string; type: string }>(edgeRes)
      .filter((e) => e.source != null && e.target != null)
      .map((e) => ({
        id: String(e.id),
        source: String(e.source),
        target: String(e.target),
        type: e.type,
      }));
    return ok({ nodes, edges });
  } catch (e) {
    return ok({ nodes: [], edges: [], error: String(e) });
  }
}
