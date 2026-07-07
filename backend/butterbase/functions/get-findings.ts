import { type Env, type Finding, cypher, ok, rows } from './_lib.ts';

// Findings feed for the right panel, newest first.
interface Ctx {
  env: Env;
}

export default async function handler(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const res = await cypher(
      `MATCH (f:Finding)
       OPTIONAL MATCH (f)-[:SUPPORTS]->(t:Technique)
       OPTIONAL MATCH (f)-[:EXTRACTED_FROM]->(s:Source)
       RETURN f.id AS id, f.text AS text, f.value AS value, f.unit AS unit,
              f.metric_name AS metric_name, f.run_id AS run_id,
              t.name AS technique, s.title AS source,
              toString(f.created_at) AS created_at
       ORDER BY f.created_at DESC`,
      {},
      ctx.env,
    );
    const findings: Finding[] = rows<Record<string, unknown>>(res).map((r) => ({
      id: String(r.id),
      text: String(r.text ?? ''),
      value: r.value == null ? null : Number(r.value),
      unit: (r.unit as string) ?? null,
      metric_name: (r.metric_name as string) ?? null,
      technique: (r.technique as string) ?? null,
      source: (r.source as string) ?? null,
      run_id: (r.run_id as string) ?? null,
      created_at: (r.created_at as string) ?? new Date().toISOString(),
    }));
    return ok(findings);
  } catch {
    return ok([]);
  }
}
