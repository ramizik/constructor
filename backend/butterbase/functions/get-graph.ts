import { type Env, cypher, ok, rows } from './_lib.ts';

// Whole knowledge graph as { nodes, edges } for Cytoscape.
interface Ctx {
  env: Env;
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
