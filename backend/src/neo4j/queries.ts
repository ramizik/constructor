import neo4j from "neo4j-driver";
import { getSession } from "./client.js";

export interface GraphNode {
  id: string;
  label: string;
  props: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Converts Neo4j driver value types (Integer, DateTime, ...) into plain
// JSON-safe values.
function cleanValue(value: unknown): unknown {
  if (neo4j.isInt(value)) return (value as neo4j.Integer).toNumber();
  if (value && typeof value === "object" && "toString" in value && !Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return String(value);
  }
  return value;
}

function cleanProps(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "id") continue;
    out[key] = cleanValue(value);
  }
  return out;
}

// Returns the whole graph as { nodes, edges } — the exact contract for
// Rohan's Butterbase read endpoint / frontend fetchGraph() to consume.
export async function getGraph(): Promise<GraphData> {
  const session = getSession();
  try {
    const nodeResult = await session.run(
      "MATCH (n) RETURN n.id AS id, labels(n)[0] AS label, properties(n) AS props"
    );
    const nodes: GraphNode[] = nodeResult.records.map((r) => ({
      id: r.get("id"),
      label: r.get("label"),
      props: cleanProps(r.get("props")),
    }));

    const edgeResult = await session.run(
      `MATCH (a)-[r]->(b)
       RETURN a.id AS source, b.id AS target, type(r) AS type, properties(r) AS props`
    );
    const edges: GraphEdge[] = edgeResult.records.map((r, i) => {
      const source = r.get("source");
      const target = r.get("target");
      const type = r.get("type");
      return { id: `${source}-${type}-${target}-${i}`, source, target, type };
    });

    return { nodes, edges };
  } finally {
    await session.close();
  }
}
