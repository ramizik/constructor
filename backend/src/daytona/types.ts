export interface TechniqueInput {
  technique_id: string;
  technique: string;
  tops_w: number;
  memory_mb: number;
  higher_is_better: { tops_w: boolean; memory_mb: boolean };
}

export interface MetricStats {
  mean: number;
  std: number;
  ci95_low: number;
  ci95_high: number;
}

export type SimulationResult =
  | {
      technique_id: string;
      technique: string;
      status: "done";
      tops_w: MetricStats;
      memory_mb: MetricStats;
    }
  | {
      technique_id: string;
      technique: string;
      status: "error";
      error: string;
    };

export type JobStatus = "pending" | "running" | "done" | "error";

export interface AnalyzeJobResult {
  status: JobStatus;
  total: number;
  completed: number;
  failed: number;
  results: SimulationResult[];
  pareto_frontier: string[];
  summary: string;
}
