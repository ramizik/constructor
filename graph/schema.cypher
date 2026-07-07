// Constructor — seed graph for demo research goal:
// "Find promising techniques for improving TOPS/W under thermal limit and
//  memory constraints for edge inference accelerators."
//
// Conforms to the LOCKED contract in docs/PHASE0_DECISIONS.md and
// docs/SCOUT_CONTRACT.md: ID prefixes (goal_/tech_/metric_/src_/find_/exp_/artifact_),
// single ResearchGoal + Technique-[:ADDRESSES]->ResearchGoal, two Pareto metrics
// (TOPS/W maximize, Memory_MB minimize), IMPROVES/HURTS edges carry {value, unit}.
//
// Run via `npm run neo4j:seed` in /backend (wipes + reloads), or paste directly
// into the Neo4j Browser. Node ids use the same slug() rule as
// backend/src/neo4j/ids.ts — keep them in sync if you edit either.

// --- ResearchGoal (exactly one, per PHASE0_DECISIONS Q2) ---
CREATE (goal:ResearchGoal {
  id: 'goal_main',
  text: 'Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators.',
  created_at: datetime()
})

// --- Techniques ---
CREATE (t1:Technique {id: 'tech_int4-quantization', name: 'INT4 Quantization', created_at: datetime()})
CREATE (t2:Technique {id: 'tech_structured-2-4-weight-sparsity', name: 'Structured 2:4 Weight Sparsity', created_at: datetime()})
CREATE (t3:Technique {id: 'tech_near-memory-compute', name: 'Near-Memory Compute', created_at: datetime()})

// --- Metrics (the two Pareto axes, per PHASE0_DECISIONS Q3) ---
CREATE (m1:Metric {id: 'metric_tops-w', name: 'TOPS/W', unit: 'TOPS/W', higher_is_better: true})
CREATE (m2:Metric {id: 'metric_memory-mb', name: 'Memory_MB', unit: 'MB', higher_is_better: false})

// --- Sources (fixed/mocked, not live-crawled) ---
CREATE (s1:Source {id: 'src_https-mlcommons-org-mlperf-tiny-2024', url: 'https://mlcommons.org/mlperf-tiny-2024', title: 'MLPerf Tiny 2024 Edge Inference Report', type: 'paper', created_at: datetime()})
CREATE (s2:Source {id: 'src_https-isscc-org-2024-near-memory-compute-edge-ai', url: 'https://isscc.org/2024/near-memory-compute-edge-ai', title: 'ISSCC 2024: Near-Memory Compute for Edge AI', type: 'paper', created_at: datetime()})

// --- Findings (one per technique per metric — 2 measurements x 3 techniques) ---
CREATE (f1a:Finding {id: 'find_int4-quant-tops-w', text: 'INT4 quantization improves TOPS/W by 2.3x with <1% accuracy loss', value: 4.2, unit: 'TOPS/W', metric_name: 'TOPS/W', raw_text: 'INT4 quantization improves TOPS/W by 2.3x with <1% accuracy loss', run_id: 'run_seed', created_at: datetime()})
CREATE (f1b:Finding {id: 'find_int4-quant-memory-mb', text: 'INT4 quantization cuts weight memory footprint to 1.8MB', value: 1.8, unit: 'MB', metric_name: 'Memory_MB', raw_text: 'INT4 quantization cuts weight memory footprint to 1.8MB', run_id: 'run_seed', created_at: datetime()})

CREATE (f2a:Finding {id: 'find_2-4-sparsity-tops-w', text: 'Structured 2:4 sparsity improves TOPS/W to 3.6', value: 3.6, unit: 'TOPS/W', metric_name: 'TOPS/W', raw_text: 'Structured 2:4 sparsity improves TOPS/W to 3.6', run_id: 'run_seed', created_at: datetime()})
CREATE (f2b:Finding {id: 'find_2-4-sparsity-memory-mb', text: 'Structured 2:4 sparsity cuts memory bandwidth 40%, footprint to 2.1MB', value: 2.1, unit: 'MB', metric_name: 'Memory_MB', raw_text: 'Structured 2:4 sparsity cuts memory bandwidth 40%, footprint to 2.1MB', run_id: 'run_seed', created_at: datetime()})

CREATE (f3a:Finding {id: 'find_nmc-tops-w', text: 'Near-memory compute reaches the best TOPS/W at 5.1', value: 5.1, unit: 'TOPS/W', metric_name: 'TOPS/W', raw_text: 'Near-memory compute reaches the best TOPS/W at 5.1', run_id: 'run_seed', created_at: datetime()})
CREATE (f3b:Finding {id: 'find_nmc-memory-mb', text: 'Near-memory compute raises on-chip memory footprint to 4.5MB', value: 4.5, unit: 'MB', metric_name: 'Memory_MB', raw_text: 'Near-memory compute raises on-chip memory footprint to 4.5MB', run_id: 'run_seed', created_at: datetime()})

// --- ExperimentRun + ResultArtifact ---
CREATE (er1:ExperimentRun {id: 'exp_seed-run-1', job_type: 'pareto_scatter', status: 'done', created_at: datetime()})
CREATE (ra1:ResultArtifact {id: 'artifact_seed-1', kind: 'chart', ref: 'pareto_scatter.png', created_at: datetime()})

// --- Relationships ---
CREATE (f1a)-[:EXTRACTED_FROM]->(s1)
CREATE (f1b)-[:EXTRACTED_FROM]->(s1)
CREATE (f2a)-[:EXTRACTED_FROM]->(s1)
CREATE (f2b)-[:EXTRACTED_FROM]->(s1)
CREATE (f3a)-[:EXTRACTED_FROM]->(s2)
CREATE (f3b)-[:EXTRACTED_FROM]->(s2)

CREATE (f1a)-[:SUPPORTS]->(t1)
CREATE (f1b)-[:SUPPORTS]->(t1)
CREATE (f2a)-[:SUPPORTS]->(t2)
CREATE (f2b)-[:SUPPORTS]->(t2)
CREATE (f3a)-[:SUPPORTS]->(t3)
CREATE (f3b)-[:SUPPORTS]->(t3)

// Technique -[:ADDRESSES]-> ResearchGoal (per PHASE0_DECISIONS Q2)
CREATE (t1)-[:ADDRESSES]->(goal)
CREATE (t2)-[:ADDRESSES]->(goal)
CREATE (t3)-[:ADDRESSES]->(goal)

// Technique -[:IMPROVES|HURTS {value, unit}]-> Metric, per SCOUT_CONTRACT §2.
// TOPS/W: higher is better, all 3 techniques improve it.
CREATE (t1)-[:IMPROVES {value: 4.2, unit: 'TOPS/W'}]->(m1)
CREATE (t2)-[:IMPROVES {value: 3.6, unit: 'TOPS/W'}]->(m1)
CREATE (t3)-[:IMPROVES {value: 5.1, unit: 'TOPS/W'}]->(m1)
// Memory_MB: lower is better. Quantization/sparsity shrink footprint (IMPROVES);
// near-memory compute adds on-chip SRAM, raising footprint (HURTS) — the real
// Pareto tradeoff the demo's one-line takeaway is built on.
CREATE (t1)-[:IMPROVES {value: 1.8, unit: 'MB'}]->(m2)
CREATE (t2)-[:IMPROVES {value: 2.1, unit: 'MB'}]->(m2)
CREATE (t3)-[:HURTS {value: 4.5, unit: 'MB'}]->(m2)

CREATE (er1)-[:TESTS]->(t1)
CREATE (er1)-[:TESTS]->(t2)
CREATE (er1)-[:TESTS]->(t3)
CREATE (er1)-[:PRODUCES]->(ra1);
