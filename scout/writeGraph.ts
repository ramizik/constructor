import { METRICS } from "./types.ts";
import type { CypherBatch, ScoutExtraction } from "./types.ts";
import { normalizeKey, slug, stableHash } from "./normalize.ts";

// SCOUT_CONTRACT.md §1-2 + Phase0 Decisions Q2-Q6: one idempotent UNWIND/MERGE batch.
// Re-running this against the same extractions must not create duplicate nodes/edges
// (Decision Q4 idempotency requirement) — everything below MERGEs on a natural key.

const GOAL_ID = "goal_main"; // Decision Q5: fixed id, matches Track 1's seed.

interface Row {
  source_id: string;
  source_url: string;
  source_title: string;
  source_type: string;
  technique_id: string;
  technique_name: string;
  metric_id: string;
  metric_name: string;
  metric_unit: string;
  higher_is_better: boolean;
  finding_id: string;
  value: number;
  unit: string;
  direction: "improves" | "hurts";
  raw_text: string;
  run_id: string;
  goal_id: string;
  created_at: string;
}

/** Intermediate JSON (one or more sources) -> the rows the Cypher UNWIND consumes. */
function toRows(extractions: ScoutExtraction[], runId: string, now: string): Row[] {
  const rows: Row[] = [];
  for (const ext of extractions) {
    const sourceId = ext.source.id; // sources.ts already assigns "src_" ids
    for (const m of ext.measurements) {
      const techniqueKey = normalizeKey(m.technique);
      const metricKey = normalizeKey(m.metric);
      const metricInfo = METRICS[m.metric];
      if (!metricInfo) {
        throw new Error(`Unknown metric "${m.metric}" — not in METRICS registry`);
      }
      const findingId =
        "find_" + stableHash(`${ext.source.url}|${techniqueKey}|${metricKey}|${m.value}`);

      rows.push({
        source_id: sourceId,
        source_url: ext.source.url,
        source_title: ext.source.title,
        source_type: ext.source.type,
        technique_id: "tech_" + slug(m.technique),
        technique_name: m.technique,
        metric_id: "metric_" + slug(m.metric),
        metric_name: m.metric,
        metric_unit: metricInfo.unit,
        higher_is_better: metricInfo.higher_is_better,
        finding_id: findingId,
        value: m.value,
        unit: m.unit,
        direction: m.direction,
        raw_text: m.raw_text,
        run_id: runId,
        goal_id: GOAL_ID,
        created_at: now,
      });
    }
  }
  return rows;
}

const CYPHER = `
UNWIND $rows AS row
MERGE (src:Source {id: row.source_id})
  ON CREATE SET src.url = row.source_url, src.title = row.source_title,
                src.type = row.source_type, src.created_at = row.created_at

MERGE (tech:Technique {id: row.technique_id})
  ON CREATE SET tech.name = row.technique_name, tech.created_at = row.created_at

MERGE (metric:Metric {id: row.metric_id})
  ON CREATE SET metric.name = row.metric_name, metric.unit = row.metric_unit,
                metric.higher_is_better = row.higher_is_better,
                metric.created_at = row.created_at

MERGE (goal:ResearchGoal {id: row.goal_id})

MERGE (finding:Finding {id: row.finding_id})
  ON CREATE SET finding.text = row.raw_text, finding.value = row.value,
                finding.unit = row.unit, finding.metric_name = row.metric_name,
                finding.raw_text = row.raw_text, finding.run_id = row.run_id,
                finding.created_at = row.created_at

MERGE (finding)-[:EXTRACTED_FROM]->(src)
MERGE (finding)-[:SUPPORTS]->(tech)
MERGE (tech)-[:ADDRESSES]->(goal)

WITH tech, metric, row
FOREACH (_ IN CASE WHEN row.direction = 'improves' THEN [1] ELSE [] END |
  MERGE (tech)-[e:IMPROVES]->(metric)
    SET e.value = row.value, e.unit = row.unit
)
FOREACH (_ IN CASE WHEN row.direction = 'hurts' THEN [1] ELSE [] END |
  MERGE (tech)-[e:HURTS]->(metric)
    SET e.value = row.value, e.unit = row.unit
)
`.trim();

/** ScoutExtraction[] -> one idempotent Cypher batch ready for the Aura HTTP Query API. */
export function buildBatch(
  extractions: ScoutExtraction[],
  runId: string,
  now: string = new Date().toISOString(),
): CypherBatch {
  return { statement: CYPHER, parameters: { rows: toRows(extractions, runId, now) } };
}
