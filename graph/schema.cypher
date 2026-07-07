// Constructor — minimal starter seed.
// Only ResearchGoal + skeleton Techniques + Metrics.
// Sources and Findings are discovered by Scout (trigger-scout FIXTURES)
// so the graph visibly grows during the demo when Scout is toggled on.

CREATE (goal:ResearchGoal {
  id: 'goal_main',
  text: 'Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators.',
  created_at: datetime()
})

// Skeleton techniques — Scout will MERGE these with measurements
CREATE (t1:Technique {id: 'tech_int4-quantization',       name: 'INT4 Quantization',          created_at: datetime()})
CREATE (t2:Technique {id: 'tech_mixed-precision-scheduling', name: 'Mixed-Precision Scheduling', created_at: datetime()})
CREATE (t3:Technique {id: 'tech_structured-sparsity',     name: 'Structured Sparsity',         created_at: datetime()})
CREATE (t4:Technique {id: 'tech_weight-streaming',        name: 'Weight Streaming',             created_at: datetime()})

// Pareto metrics
CREATE (m1:Metric {id: 'metric_tops-w',    name: 'TOPS/W',     unit: 'TOPS/W', higher_is_better: true})
CREATE (m2:Metric {id: 'metric_memory-mb', name: 'Memory_MB',  unit: 'MB',     higher_is_better: false})

// Techniques address goal from day-0 so graph is never disconnected
CREATE (t1)-[:ADDRESSES]->(goal)
CREATE (t2)-[:ADDRESSES]->(goal)
CREATE (t3)-[:ADDRESSES]->(goal)
CREATE (t4)-[:ADDRESSES]->(goal);
