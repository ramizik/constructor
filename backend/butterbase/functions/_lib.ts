// Shared helpers inlined into every function by esbuild.

export interface Env {
  BUTTERBASE_APP_ID: string;
  BUTTERBASE_API_URL: string;
  BUTTERBASE_SERVICE_KEY: string;
  NEO4J_QUERY_URL: string;
  NEO4J_USER: string;
  NEO4J_PASSWORD: string;
  DAYTONA_API_URL: string;
  DAYTONA_API_KEY: string;
}

// ---------------------------------------------------------------------------
// Neo4j HTTP (Aura Query API v2 — not the legacy tx/commit endpoint, and not
// bolt: the Function runtime only guarantees Web APIs (fetch), no raw TCP).
// NEO4J_QUERY_URL is the full endpoint Aura hands out, e.g.
// https://<dbid>.databases.neo4j.io/db/<dbid>/query/v2 — used as-is.
// ---------------------------------------------------------------------------
export async function cypher(
  query: string,
  params: Record<string, unknown> = {},
  env: Env,
) {
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

export interface CypherResult {
  fields: string[];
  values: unknown[][];
}

export function rows<T extends Record<string, unknown>>(result: CypherResult): T[] {
  const { fields, values } = result;
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    fields.forEach((field, i) => (obj[field] = row[i]));
    return obj as T;
  });
}

// ---------------------------------------------------------------------------
// Butterbase REST (service-key, server-side only)
// ---------------------------------------------------------------------------
export async function bbGet<T>(path: string, env: Env): Promise<T> {
  return bbFetch<T>('GET', path, undefined, env);
}

export async function bbInsert<T>(
  table: string,
  body: Record<string, unknown> | Record<string, unknown>[],
  env: Env,
): Promise<T> {
  return bbFetch<T>('POST', `/${table}`, body, env);
}

export async function bbUpdate(
  table: string,
  filter: string,
  body: Record<string, unknown>,
  env: Env,
): Promise<void> {
  await bbFetch<unknown>('PATCH', `/${table}?${filter}`, body, env);
}

async function bbFetch<T>(
  method: string,
  path: string,
  body: unknown,
  env: Env,
): Promise<T> {
  const base = env.BUTTERBASE_API_URL || 'https://api.butterbase.ai';
  const url = `${base}/v1/${env.BUTTERBASE_APP_ID}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.BUTTERBASE_SERVICE_KEY}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`BB ${method} ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function ok(data: unknown): Response {
  return Response.json(data);
}

export function err(msg: string, status = 500): Response {
  return Response.json({ error: msg }, { status });
}

// ---------------------------------------------------------------------------
// Locked Phase-0 contract helpers (see docs/PHASE0_DECISIONS.md + SCOUT_CONTRACT.md)
// ---------------------------------------------------------------------------

// Q4 merge-key normalization: lower → trim → collapse whitespace → strip trailing punctuation.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '');
}

// Q5 slug(): normalize, then non-[a-z0-9] runs → single '-', strip leading/trailing '-'.
export function slug(name: string): string {
  return normalizeName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Q5 ID prefixes.
export const goalId = () => 'goal_main';
export const srcId = (url: string) => 'src_' + slug(url);
export const techId = (name: string) => 'tech_' + slug(name);
export const metricId = (name: string) => 'metric_' + slug(name);
export const runId = () => 'run_' + crypto.randomUUID();
export const expId = () => 'exp_' + crypto.randomUUID();
export const artifactId = () => 'artifact_' + crypto.randomUUID();

// §4 Finding id = "find_" + hash(source_url + technique_name + metric_name + value).
export async function findId(
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

// The two locked metrics (Q3): TOPS/W maximize, Memory_MB minimize.
export const METRICS = {
  topsPerWatt: { name: 'TOPS/W', unit: 'TOPS/W', higher_is_better: true },
  memory: { name: 'Memory_MB', unit: 'MB', higher_is_better: false },
} as const;

// ---- Shared contract types (mirror of frontend/src/types.ts) --------------
export interface Job {
  id: string;
  type: 'scout' | 'analyze' | 'plan';
  status: 'pending' | 'running' | 'done' | 'error';
  params: Record<string, unknown>;
  result_ref?: string | null;
  message?: string | null;
  created_at: string;
}

export interface Finding {
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

export interface ParetoPoint {
  technique_id: string;
  technique: string;
  tops_w: number;
  memory_mb: number;
  higher_is_better: { tops_w: boolean; memory_mb: boolean };
}

export interface ChartArtifact {
  kind: 'chart';
  title: string;
  image_url: string;
  takeaway?: string;
}

export interface TableArtifact {
  kind: 'table';
  title: string;
  columns: string[];
  rows: (string | number)[][];
  takeaway?: string;
}

export type Artifact = ChartArtifact | TableArtifact;
