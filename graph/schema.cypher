// Constructor — seed graph for demo research goal:
// "Find promising techniques for improving TOPS/W under thermal limit and
//  memory constraints for edge inference accelerators."
//
// Paste this whole file into the Neo4j Browser (Aura console) and run it.
// Every node carries a stable `id` — Scout/Analyst writes and the frontend
// fixture must reuse these same ids/labels.

// --- ResearchGoal ---
CREATE (goal:ResearchGoal {
  id: 'goal-1',
  text: 'Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators.',
  created_at: datetime()
})

// --- Techniques ---
CREATE (t1:Technique {id: 'technique-int4-quant', name: 'INT4 Quantization', description: 'Post-training INT4 weight quantization for edge inference'})
CREATE (t2:Technique {id: 'technique-2-4-sparsity', name: 'Structured 2:4 Weight Sparsity', description: 'Hardware-supported structured sparsity pruning'})
CREATE (t3:Technique {id: 'technique-nmc', name: 'Near-Memory Compute', description: 'Compute-in/near-memory to cut DRAM access energy'})

// --- Metrics ---
CREATE (m1:Metric {id: 'metric-tops-per-watt', name: 'TOPS/W', unit: 'TOPS/W'})
CREATE (m2:Metric {id: 'metric-peak-die-temp', name: 'Peak Die Temp', unit: 'degC'})

// --- Sources (fixed/mocked, not live-crawled) ---
CREATE (s1:Source {id: 'source-mlperf-tiny-2024', title: 'MLPerf Tiny 2024 Edge Inference Report', url: 'https://mlcommons.org/mlperf-tiny-2024'})
CREATE (s2:Source {id: 'source-isscc-2024-nmc', title: 'ISSCC 2024: Near-Memory Compute for Edge AI', url: 'https://isscc.org/2024/near-memory-compute-edge-ai'})

// --- Findings ---
CREATE (f1:Finding {id: 'finding-int4-quant', text: 'INT4 quantization improves TOPS/W by 2.3x with <1% accuracy loss', metric_value: 2.3, created_at: datetime()})
CREATE (f2:Finding {id: 'finding-2-4-sparsity', text: 'Structured 2:4 sparsity cuts memory bandwidth 40%, TOPS/W +1.6x', metric_value: 1.6, created_at: datetime()})
CREATE (f3:Finding {id: 'finding-nmc', text: 'Near-memory compute cuts DRAM access energy 35%, raises peak die temp by 8C', metric_value: 8.0, created_at: datetime()})

// --- ExperimentRun + ResultArtifact ---
CREATE (er1:ExperimentRun {id: 'run-1', job_type: 'comparative_ranking', status: 'done', created_at: datetime()})
CREATE (ra1:ResultArtifact {id: 'artifact-1', kind: 'table', ref: 'ranking_table.json', created_at: datetime()})

// --- Relationships ---
CREATE (f1)-[:EXTRACTED_FROM]->(s1)
CREATE (f2)-[:EXTRACTED_FROM]->(s1)
CREATE (f3)-[:EXTRACTED_FROM]->(s2)

CREATE (f1)-[:SUPPORTS]->(t1)
CREATE (f2)-[:SUPPORTS]->(t2)
CREATE (f3)-[:SUPPORTS]->(t3)
CREATE (f1)-[:SUPPORTS]->(goal)
CREATE (f2)-[:SUPPORTS]->(goal)
CREATE (f3)-[:SUPPORTS]->(goal)

CREATE (t1)-[:IMPROVES]->(m1)
CREATE (t2)-[:IMPROVES]->(m1)
CREATE (t3)-[:IMPROVES]->(m1)
CREATE (t3)-[:HURTS]->(m2)

CREATE (er1)-[:TESTS]->(t1)
CREATE (er1)-[:TESTS]->(t2)
CREATE (er1)-[:TESTS]->(t3)
CREATE (er1)-[:PRODUCES]->(ra1);
