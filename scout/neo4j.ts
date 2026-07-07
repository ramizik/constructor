import type { CypherBatch } from "./types.ts";

// Thin fetch client for Neo4j Aura's HTTP Query API. Deliberately NOT the bolt
// `neo4j-driver` — the Butterbase Function runtime only guarantees Web APIs (fetch),
// not raw TCP sockets, so bolt is unavailable there. Using this same client locally
// (Node) and in the deployed Function (Deno) keeps dev.ts and trigger-scout in sync.
//
// Credentials are passed in explicitly (not read from env here) so the deployed
// Function can supply them via ctx.env and local dev can supply them via process.env
// without this module caring which runtime it's in.

export interface Neo4jConfig {
  /** e.g. https://<dbid>.databases.neo4j.io/db/neo4j/query/v2 */
  queryUrl: string;
  user: string;
  password: string;
}

export interface Neo4jQueryResult {
  data: { fields: string[]; values: unknown[][] };
  counters?: Record<string, number>;
}

function basicAuthHeader(user: string, password: string): string {
  // btoa is a standard Web API, available in both Node 18+ and Deno.
  return "Basic " + btoa(`${user}:${password}`);
}

/** Run one Cypher statement + parameters against Aura. Throws on non-2xx. */
export async function runCypher(
  cfg: Neo4jConfig,
  batch: CypherBatch,
): Promise<Neo4jQueryResult> {
  const res = await fetch(cfg.queryUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(cfg.user, cfg.password),
    },
    body: JSON.stringify({
      statement: batch.statement,
      parameters: batch.parameters,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`Neo4j query failed: ${res.status} ${res.statusText} — ${body}`);
  }

  return res.json();
}
