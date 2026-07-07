// Shared Scout types. Kept dependency-free so the same shapes work in Node (local
// dev) and Deno (the deployed Butterbase Function).

export type SourceType = "paper" | "pasted";

/** A fixed, hardcoded source Scout extracts from. No live fetching. */
export interface SourceMeta {
  id: string;
  url: string;
  title: string;
  type: SourceType;
  text: string;
}

/** One measured claim pulled from a source (SCOUT_CONTRACT.md §5). */
export interface Measurement {
  technique: string;
  metric: string; // canonical metric name, e.g. "TOPS/W" | "Memory_MB"
  value: number;
  unit: string;
  direction: "improves" | "hurts";
  raw_text: string;
}

/** Extraction output for a single source. Decouples extraction from graph writes. */
export interface ScoutExtraction {
  source: { id: string; url: string; title: string; type: SourceType };
  measurements: Measurement[];
}

/** Registry of the two metrics the Pareto job ranks on (Decision Q3/Q6). */
export const METRICS: Record<string, { unit: string; higher_is_better: boolean }> = {
  "TOPS/W": { unit: "TOPS/W", higher_is_better: true },
  "Memory_MB": { unit: "MB", higher_is_better: false },
};

/** A Neo4j Cypher statement + parameters, ready for the Aura HTTP Query API. */
export interface CypherBatch {
  statement: string;
  parameters: Record<string, unknown>;
}
