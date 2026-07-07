import { runTechniqueSimulation } from "./simulate.js";
import { updateJobStatus } from "./jobStore.js";
import type { TechniqueInput, SimulationResult, AnalyzeJobResult } from "./types.js";

type DoneResult = Extract<SimulationResult, { status: "done" }>;

function computeParetoFrontier(results: SimulationResult[]): string[] {
  const done = results.filter((r): r is DoneResult => r.status === "done");
  const frontier: string[] = [];
  for (const candidate of done) {
    const dominated = done.some((other) => {
      if (other.technique_id === candidate.technique_id) return false;
      const betterOrEqualTops = other.tops_w.mean >= candidate.tops_w.mean;
      const betterOrEqualMem = other.memory_mb.mean <= candidate.memory_mb.mean;
      const strictlyBetter =
        other.tops_w.mean > candidate.tops_w.mean || other.memory_mb.mean < candidate.memory_mb.mean;
      return betterOrEqualTops && betterOrEqualMem && strictlyBetter;
    });
    if (!dominated) frontier.push(candidate.technique_id);
  }
  return frontier;
}

function buildSummary(results: SimulationResult[], frontier: string[]): string {
  const done = results.filter((r): r is DoneResult => r.status === "done");
  const failed = results.filter((r) => r.status === "error");
  const frontierNames = done
    .filter((r) => frontier.includes(r.technique_id))
    .map((r) => r.technique)
    .join(", ");
  const failedNote = failed.length ? ` (${failed.length} simulation(s) failed)` : "";
  return `${frontier.length} of ${done.length} techniques dominate the TOPS/W vs Memory tradeoff: ${frontierNames}.${failedNote}`;
}

export async function runAnalyzeJob(jobId: string, techniques: TechniqueInput[]): Promise<AnalyzeJobResult> {
  await updateJobStatus(jobId, "running");

  const settled = await Promise.allSettled(techniques.map((t) => runTechniqueSimulation(t)));
  const results: SimulationResult[] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          technique_id: techniques[i].technique_id,
          technique: techniques[i].technique,
          status: "error",
          error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        },
  );

  const completed = results.filter((r) => r.status === "done").length;
  const failed = results.filter((r) => r.status === "error").length;
  const frontier = computeParetoFrontier(results);
  const summary = buildSummary(results, frontier);
  const status = failed === results.length ? "error" : "done";

  await updateJobStatus(jobId, status);

  return { status, total: results.length, completed, failed, results, pareto_frontier: frontier, summary };
}
