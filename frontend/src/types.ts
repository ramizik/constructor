// ---------------------------------------------------------------------------
// SHARED INTERFACE CONTRACTS
// This file is the frontend's source of truth for the shapes it consumes.
// Keep in sync with:
//   - Logan (Neo4j -> GraphData)
//   - Ramiz (Daytona artifact -> Artifact)
//   - Butterbase jobs table / functions (Job)
// ---------------------------------------------------------------------------

export type NodeType =
  | 'ResearchGoal'
  | 'Technique'
  | 'Metric'
  | 'Finding'
  | 'Source'
  | 'ExperimentRun'
  | 'ResultArtifact'
  | 'AgentTask';

export type RelType =
  | 'SUPPORTS'
  | 'EXTRACTED_FROM'
  | 'TESTS'
  | 'PRODUCES'
  | 'IMPROVES'
  | 'HURTS'
  | 'ADDRESSES'
  | 'CREATED';

// ---- Graph (Neo4j -> Cytoscape) -------------------------------------------
export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  /** optional bag of extra props shown in future detail panel */
  props?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelType;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---- Jobs (Butterbase jobs table) -----------------------------------------
export type JobType = 'scout' | 'analyze' | 'plan';
export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  params: Record<string, unknown>;
  /** reference to produced artifact / result, if any */
  result_ref?: string | null;
  message?: string | null;
  created_at: string;
}

// ---- Findings feed (right panel) ------------------------------------------
// Locked contract (SCOUT_CONTRACT §1): value is numeric (or null), never a
// string like "~4 TOPS/W". The human string lives in text/raw_text.
export interface Finding {
  id: string;
  text: string;
  value: number | null;
  unit: string | null;
  metric_name: string | null;
  technique?: string | null;
  source?: string | null;
  run_id?: string | null;
  created_at: string;
}

// ---- Artifact (Daytona -> ResultArtifact) ---------------------------------
export type ArtifactKind = 'table' | 'chart';

export interface TableArtifact {
  kind: 'table';
  title: string;
  columns: string[];
  rows: (string | number)[][];
  takeaway?: string;
}

export interface ChartArtifact {
  kind: 'chart';
  title: string;
  /** URL or data URI to the rendered chart image */
  image_url: string;
  takeaway?: string;
}

export type Artifact = TableArtifact | ChartArtifact;

// ---- Modal params ----------------------------------------------------------
export interface ScoutParams {
  sources: string[];
  focusHint?: string;
}

export interface AnalyzeParams {
  // Locked (PHASE0_DECISIONS Q3): Pareto is primary, ranking is fallback.
  jobType: 'pareto' | 'ranking';
  note?: string;
}

// ---- Service layer contract ------------------------------------------------
// The whole app talks to this interface. Mock impl now, Butterbase impl later.
export interface ConstructorService {
  getGraph(): Promise<GraphData>;
  getFindings(): Promise<Finding[]>;
  getJobs(): Promise<Job[]>;
  getArtifact(ref: string): Promise<Artifact | null>;
  triggerScout(params: ScoutParams): Promise<{ job_id: string }>;
  triggerAnalyze(params: AnalyzeParams): Promise<{ job_id: string }>;
  /** subscribe to job + graph changes; returns unsubscribe fn */
  subscribe(cb: (event: ServiceEvent) => void): () => void;
}

export type ServiceEvent =
  | { kind: 'job'; job: Job }
  | { kind: 'graph'; graph: GraphData }
  | { kind: 'finding'; finding: Finding }
  | { kind: 'artifact'; ref: string; artifact: Artifact };

export const FIXED_SOURCES = [
  'arxiv:tops-per-watt-survey',
  'arxiv:edge-accelerator-thermal-2025',
  'internal:memory-constrained-inference',
];

export const RESEARCH_GOAL =
  'Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators.';

export const NODE_COLORS: Record<NodeType, string> = {
  ResearchGoal: '#f472b6',
  Technique: '#38bdf8',
  Metric: '#facc15',
  Finding: '#4ade80',
  Source: '#a78bfa',
  ExperimentRun: '#fb923c',
  ResultArtifact: '#f87171',
  AgentTask: '#94a3b8',
};
