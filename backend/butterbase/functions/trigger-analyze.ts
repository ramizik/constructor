import {
  type Artifact,
  type Env,
  type ParetoPoint,
  artifactId,
  bbInsert,
  bbUpdate,
  cypher,
  expId,
  ok,
  rows,
} from './_lib.ts';

// Analyst agent. Pulls the two-metric payload from Neo4j, ships it to the
// RocketRide Cloud pipeline (see docs/ROADMAP.md), which starts/monitors the
// real Daytona job and hands back an artifact. ROCKETRIDE_PIPELINE_URL is
// required — there is no local/deterministic substitute. Set it via
// `manage_function update_env` (or `butterbase functions env set` on the CLI
// path) once the pipeline + relay (backend/src/rocketride/relay.ts) are up.
interface Ctx {
  env: Env;
  waitUntil: (p: Promise<unknown>) => void;
}

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const params = (await req.json().catch(() => ({}))) as {
    jobType?: 'pareto' | 'ranking';
    note?: string;
  };
  const id = `job_analyze_${Date.now()}`;
  await bbInsert(
    'jobs',
    { id, type: 'analyze', status: 'pending', params: JSON.stringify(params) },
    ctx.env,
  );
  ctx.waitUntil(runAnalyze(ctx.env, id, params.jobType ?? 'pareto'));
  return ok({ job_id: id });
}

async function runAnalyze(env: Env, jobId: string, jobType: 'pareto' | 'ranking') {
  const exp_id = expId();
  const artifact_id = artifactId();
  try {
    await bbUpdate('jobs', `id=eq.${jobId}`, { status: 'running' }, env);

    // Pivot the two IMPROVES/HURTS edges per technique into one row. Direction
    // (IMPROVES vs HURTS) is semantic labeling only — a technique that shrinks
    // memory footprint gets IMPROVES->Memory_MB, one that grows it gets HURTS -
    // the Pareto chart just needs the number, so match either.
    const result = await cypher(
      `MATCH (t:Technique)-[imp:IMPROVES|HURTS]->(:Metric {name: 'TOPS/W'})
       MATCH (t)-[mem:IMPROVES|HURTS]->(:Metric {name: 'Memory_MB'})
       RETURN t.id AS technique_id, t.name AS technique,
              imp.value AS tops_w, mem.value AS memory_mb`,
      {},
      env,
    );
    const points: ParetoPoint[] = rows<{
      technique_id: string;
      technique: string;
      tops_w: number;
      memory_mb: number;
    }>(result).map((r) => ({
      technique_id: r.technique_id,
      technique: r.technique,
      tops_w: Number(r.tops_w),
      memory_mb: Number(r.memory_mb),
      higher_is_better: { tops_w: true, memory_mb: false },
    }));

    const artifact = await runRocketRidePipeline(env, jobType, points);

    await cypher(
      `MERGE (run:ExperimentRun {id: $expId})
         ON CREATE SET run.created_at = datetime(), run.job_type = $jobType
       MERGE (art:ResultArtifact {id: $artifactId})
         ON CREATE SET art.title = $title, art.payload = $payload,
                       art.created_at = datetime()
       MERGE (run)-[:PRODUCES]->(art)
       WITH run
       MATCH (t:Technique) MERGE (run)-[:TESTS]->(t)`,
      {
        expId: exp_id,
        artifactId: artifact_id,
        jobType,
        title: artifact.title,
        payload: JSON.stringify(artifact),
      },
      env,
    );

    await bbUpdate('jobs', `id=eq.${jobId}`, { status: 'done', result_ref: artifact_id }, env);
  } catch (e) {
    await bbUpdate('jobs', `id=eq.${jobId}`, { status: 'error', message: String(e) }, env);
  }
}

// Calls the deployed RocketRide Cloud pipeline, which starts the Daytona job,
// waits on it, and returns the result. No local fallback: if the pipeline
// isn't configured or reachable, the job fails loudly (status: 'error',
// message set) instead of silently returning a fake artifact.
async function runRocketRidePipeline(
  env: Env,
  jobType: 'pareto' | 'ranking',
  points: ParetoPoint[],
): Promise<Artifact> {
  if (!env.ROCKETRIDE_PIPELINE_URL) {
    throw new Error(
      'ROCKETRIDE_PIPELINE_URL is not set on trigger-analyze. Deploy the RocketRide ' +
        'pipeline + relay (backend/src/rocketride/relay.ts) and set the env var — ' +
        'see docs/ROADMAP.md.',
    );
  }
  const res = await fetch(env.ROCKETRIDE_PIPELINE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobType, data: points }),
  });
  if (!res.ok) {
    throw new Error(`RocketRide pipeline returned ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Artifact;
}
