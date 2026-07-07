import { randomUUID } from "node:crypto";
import { SOURCES } from "./sources.ts";
import { extract } from "./extract.ts";
import { buildBatch } from "./writeGraph.ts";
import { runCypher } from "./neo4j.ts";
import type { ScoutExtraction } from "./types.ts";

// Local dev runner (Plan Phase 1, Steps 1-2). No Butterbase involved.
//   node scout/dev.ts            -> extraction + Cypher batch printed, no network
//   node scout/dev.ts --write    -> also POSTs to Aura twice to prove idempotency
// Aura creds come from env vars for local testing only; the deployed Function reads
// them from ctx.env instead (see trigger-scout.function.ts).

function assertTwoMeasurementsPerTechnique(extractions: ScoutExtraction[]) {
  const problems: string[] = [];
  for (const ext of extractions) {
    if (ext.measurements.length !== 2) {
      problems.push(
        `${ext.source.id}: expected 2 measurements, got ${ext.measurements.length}`,
      );
    }
  }
  if (problems.length) {
    throw new Error("Extraction assertion failed:\n" + problems.join("\n"));
  }
}

async function main() {
  const shouldWrite = process.argv.includes("--write");

  console.log(`Extracting from ${SOURCES.length} sources...\n`);
  const extractions = SOURCES.map(extract);

  for (const ext of extractions) {
    console.log(JSON.stringify(ext, null, 2));
  }

  assertTwoMeasurementsPerTechnique(extractions);
  console.log("\n✓ every source yielded 2 measurements (TOPS/W + Memory_MB)\n");

  const runId = "run_" + randomUUID();
  const batch = buildBatch(extractions, runId);
  console.log(`Built Cypher batch (run_id=${runId}), ${batch.parameters.rows.length} rows.`);

  if (!shouldWrite) {
    console.log("\n(pass --write with NEO4J_QUERY_URL/NEO4J_USER/NEO4J_PASSWORD set " +
      "to also run it against Aura and prove idempotency)");
    return;
  }

  const cfg = {
    queryUrl: requireEnv("NEO4J_QUERY_URL"),
    user: requireEnv("NEO4J_USER"),
    password: requireEnv("NEO4J_PASSWORD"),
  };

  console.log("\nWriting to Aura (1st run)...");
  await runCypher(cfg, batch);
  const count1 = await countNodes(cfg);
  console.log("Node counts after 1st run:", count1);

  console.log("\nWriting to Aura (2nd run, same run_id — idempotency check)...");
  await runCypher(cfg, buildBatch(extractions, runId));
  const count2 = await countNodes(cfg);
  console.log("Node counts after 2nd run:", count2);

  const stable = JSON.stringify(count1) === JSON.stringify(count2);
  console.log(stable ? "\n✓ idempotent — counts unchanged on re-run" :
    "\n✗ NOT idempotent — counts changed, inspect MERGE keys");
  if (!stable) process.exitCode = 1;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function countNodes(cfg: { queryUrl: string; user: string; password: string }) {
  const res = await runCypher(cfg, {
    statement: "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY label",
    parameters: {},
  });
  const rows: Record<string, number> = {};
  for (const [label, n] of res.data.values as [string, number][]) {
    rows[label] = n;
  }
  return rows;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
