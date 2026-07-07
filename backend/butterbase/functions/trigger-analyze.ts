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
// Daytona Pareto job (Ramiz's track), then writes ExperimentRun + ResultArtifact
// back to the graph. Ranking table is the built-in fallback (PHASE0_DECISIONS Q3).
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

    // Pivot the two IMPROVES/HURTS edges per technique into one row.
    const result = await cypher(
      `MATCH (t:Technique)-[imp:IMPROVES]->(:Metric {name: 'TOPS/W'})
       MATCH (t)-[hurt:HURTS]->(:Metric {name: 'Memory_MB'})
       RETURN t.id AS technique_id, t.name AS technique,
              imp.value AS tops_w, hurt.value AS memory_mb`,
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

    const artifact = await runDaytonaJob(env, jobType, points);

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

async function runDaytonaJob(
  env: Env,
  jobType: 'pareto' | 'ranking',
  points: ParetoPoint[],
): Promise<Artifact> {
  if (env.DAYTONA_API_URL && env.DAYTONA_API_KEY) {
    const res = await fetch(`${env.DAYTONA_API_URL}/pareto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DAYTONA_API_KEY}`,
      },
      body: JSON.stringify({ jobType, data: points }),
    }).catch(() => null);
    if (res && res.ok) return (await res.json()) as Artifact;
  }
  return fallbackArtifact(jobType, points);
}

// Deterministic fallback so the demo never hard-fails if the sandbox is down.
function fallbackArtifact(jobType: 'pareto' | 'ranking', points: ParetoPoint[]): Artifact {
  if (jobType === 'ranking') {
    const ranked = [...points].sort((a, b) => b.tops_w - a.tops_w);
    return {
      kind: 'table',
      title: 'Technique Ranking — TOPS/W',
      columns: ['Technique', 'TOPS/W', 'Memory (MB)'],
      rows: ranked.map((p) => [p.technique, p.tops_w, p.memory_mb]),
      takeaway: ranked.length ? `${ranked[0].technique} leads on raw TOPS/W.` : undefined,
    };
  }
  const frontier = paretoFrontier(points);
  return {
    kind: 'chart',
    title: 'Pareto Frontier — TOPS/W (↑) vs Memory (↓)',
    image_url: paretoSvg(points, frontier),
    takeaway: frontier.length
      ? `${frontier.map((p) => p.technique).join(' & ')} dominate the efficiency/memory tradeoff.`
      : undefined,
  };
}

function paretoFrontier(pts: ParetoPoint[]): ParetoPoint[] {
  // Maximize tops_w, minimize memory_mb.
  return pts.filter(
    (p) => !pts.some((q) => q !== p && q.tops_w >= p.tops_w && q.memory_mb <= p.memory_mb &&
      (q.tops_w > p.tops_w || q.memory_mb < p.memory_mb)),
  );
}

function paretoSvg(pts: ParetoPoint[], frontier: ParetoPoint[]): string {
  const W = 420, H = 300, pad = 44;
  const xs = pts.map((p) => p.memory_mb), ys = pts.map((p) => p.tops_w);
  const xMin = Math.min(...xs, 0), xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 1);
  const sx = (v: number) => pad + ((v - xMin) / (xMax - xMin || 1)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v - yMin) / (yMax - yMin || 1)) * (H - 2 * pad);
  const fset = new Set(frontier);
  const dots = pts
    .map((p) => {
      const on = fset.has(p);
      return `<circle cx="${sx(p.memory_mb).toFixed(1)}" cy="${sy(p.tops_w).toFixed(1)}" r="${on ? 6 : 4}" fill="${on ? '#38bdf8' : '#64748b'}"/>` +
        `<text x="${(sx(p.memory_mb) + 8).toFixed(1)}" y="${(sy(p.tops_w) + 3).toFixed(1)}" fill="#cbd5e1" font-size="9">${p.technique}</text>`;
    })
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#0b0f17"/>` +
    `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#334155"/>` +
    `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="#334155"/>` +
    `<text x="${W / 2}" y="${H - 10}" fill="#94a3b8" font-size="10" text-anchor="middle">Memory (MB) →</text>` +
    `<text x="14" y="${H / 2}" fill="#94a3b8" font-size="10" text-anchor="middle" transform="rotate(-90 14 ${H / 2})">TOPS/W →</text>` +
    dots +
    `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
