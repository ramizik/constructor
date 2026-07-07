import { daytona } from "./client.js";
import type { TechniqueInput, SimulationResult } from "./types.js";

const N_SAMPLES = 500;
const REL_STD = 0.05;

function buildScript(input: TechniqueInput): string {
  return `
import random, statistics, json

def sample(mean, rel_std, n):
    return [random.gauss(mean, mean * rel_std) for _ in range(n)]

def stats(samples):
    mean = statistics.fmean(samples)
    std = statistics.pstdev(samples)
    return {"mean": mean, "std": std, "ci95_low": mean - 1.96 * std, "ci95_high": mean + 1.96 * std}

tops_samples = sample(${input.tops_w}, ${REL_STD}, ${N_SAMPLES})
mem_samples = sample(${input.memory_mb}, ${REL_STD}, ${N_SAMPLES})

print(json.dumps({"tops_w": stats(tops_samples), "memory_mb": stats(mem_samples)}))
`;
}

export async function runTechniqueSimulation(input: TechniqueInput): Promise<SimulationResult> {
  const sandbox = await daytona.create({ language: "python" });
  try {
    const response = await sandbox.process.codeRun(buildScript(input));
    const lastLine = response.result.trim().split("\n").pop() ?? "";
    const parsed = JSON.parse(lastLine);
    return {
      technique_id: input.technique_id,
      technique: input.technique,
      status: "done",
      tops_w: parsed.tops_w,
      memory_mb: parsed.memory_mb,
    };
  } catch (err) {
    return {
      technique_id: input.technique_id,
      technique: input.technique,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await daytona.delete(sandbox);
  }
}
