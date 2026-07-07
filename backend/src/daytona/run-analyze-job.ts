import { randomUUID } from "node:crypto";
import { runAnalyzeJob } from "./batch.js";
import type { TechniqueInput } from "./types.js";

// Mock data matches the SCOUT_CONTRACT.md §3/§6 payload shape.
// Swap for the real Neo4j read query once Track 1/3 data lands.
const MOCK_TECHNIQUES: TechniqueInput[] = [
  {
    technique_id: "tech_sparse-dataflow",
    technique: "Sparsity-aware dataflow",
    tops_w: 4.2,
    memory_mb: 1.5,
    higher_is_better: { tops_w: true, memory_mb: false },
  },
  {
    technique_id: "tech_mixed-precision",
    technique: "Mixed-precision quant",
    tops_w: 3.1,
    memory_mb: 0.9,
    higher_is_better: { tops_w: true, memory_mb: false },
  },
  {
    technique_id: "tech_weight-clustering",
    technique: "Weight clustering",
    tops_w: 2.6,
    memory_mb: 0.6,
    higher_is_better: { tops_w: true, memory_mb: false },
  },
];

async function main() {
  const jobId = randomUUID();
  console.log(`Starting analyze job ${jobId} with ${MOCK_TECHNIQUES.length} techniques...`);
  const result = await runAnalyzeJob(jobId, MOCK_TECHNIQUES);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Analyze job failed:", err);
  process.exit(1);
});
