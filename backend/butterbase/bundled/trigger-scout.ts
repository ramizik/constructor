// Scout agent (Butterbase Function, TS). Extracts findings from a fixed set of
// pre-picked sources and writes them into Neo4j per the LOCKED Scout contract:
//   - two measurements per technique (TOPS/W improves, Memory_MB hurts)
//   - MERGE Source/Technique/Metric on natural keys; CREATE Finding by content hash
//   - (:Technique)-[:ADDRESSES]->(:ResearchGoal) to stay connected to the seed
// Extraction is deterministic for demo stability; swap FIXTURES for regex/Nebius later.
interface Ctx {
  env: Env;
  db: any;
  waitUntil: (p: Promise<unknown>) => void;
}

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const params = (await req.json().catch(() => ({}))) as {
    sources?: string[];
    focus_hint?: string;
    mode?: 'auto';
  };
  const id = `job_scout_${Date.now()}`;
  const run_id = runId();

  // Auto mode (SCOUT_REQUIREMENTS §2.1): release one un-ingested source per call so
  // the frontend toggle can grow the graph tick by tick. The write path is unchanged
  // and idempotent — this only picks WHICH source to send through it.
  if (params.mode === 'auto') {
    const nextKey = await pickNextAutoSource(ctx.env);
    if (!nextKey) {
      // Pool exhausted — record a no-op job for a real job_id, signal frontend to stop.
      await jobsInsert(ctx.db, { id, type: 'scout', status: 'done', params });
      await jobsUpdate(ctx.db, id, {
        result_ref: JSON.stringify({ run_id, nodes: 0, edges: 0, done: true }),
      });
      return ok({ job_id: id, run_id, nodes: 0, edges: 0, done: true });
    }
    await jobsInsert(ctx.db, { id, type: 'scout', status: 'pending', params });
    ctx.waitUntil(runScout(ctx, id, run_id, [nextKey]));
    return ok({ job_id: id, run_id, done: false });
  }

  await jobsInsert(ctx.db, { id, type: 'scout', status: 'pending', params });

  ctx.waitUntil(runScout(ctx, id, run_id, params.sources));
  return ok({ job_id: id, run_id });
}

// First FIXTURES key whose Source is not yet in Neo4j, or null if all ingested.
// Uses srcId()/the same slug rule the writer uses, so the diff can't drift from
// what runScout actually MERGEs. Seed Source ids differ from FIXTURES ids, so seed
// sources never get mistaken for scouted ones.
async function pickNextAutoSource(env: Env): Promise<string | null> {
  const res = await cypher('MATCH (s:Source) RETURN s.id AS id', {}, env);
  const ingested = new Set(rows<{ id: string }>(res).map((r) => r.id));
  for (const key of Object.keys(FIXTURES)) {
    if (!ingested.has(srcId(FIXTURES[key].url))) return key;
  }
  return null;
}

async function runScout(ctx: Ctx, jobId: string, run_id: string, sources?: string[]) {
  const env = ctx.env;
  try {
    await jobsUpdate(ctx.db, jobId, { status: 'running' });

    const selected = sources?.length ? sources : Object.keys(FIXTURES);
    let nodes = 0;
    let edges = 0;

    for (const key of selected) {
      const src = FIXTURES[key];
      if (!src) continue;
      for (const m of src.measurements) {
        const isImproves = METRICS.topsPerWatt.name === m.metric;
        const metric = isImproves ? METRICS.topsPerWatt : METRICS.memory;
        const rel = metric.higher_is_better ? 'IMPROVES' : 'HURTS';
        const fId = await findId(src.url, m.technique, m.metric, m.value);

        await cypher(
          `MERGE (goal:ResearchGoal {id: 'goal_main'})
           MERGE (s:Source {id: $srcId})
             ON CREATE SET s.url = $url, s.title = $title, s.type = $srcType,
                           s.created_at = datetime()
           MERGE (t:Technique {id: $techId})
             ON CREATE SET t.name = $technique, t.created_at = datetime()
           MERGE (mnode:Metric {id: $metricId})
             ON CREATE SET mnode.name = $metricName, mnode.unit = $unit,
                           mnode.higher_is_better = $hib, mnode.created_at = datetime()
           MERGE (t)-[:ADDRESSES]->(goal)
           MERGE (f:Finding {id: $findId})
             ON CREATE SET f.text = $text, f.value = $value, f.unit = $unit,
                           f.metric_name = $metricName, f.raw_text = $rawText,
                           f.run_id = $runId, f.created_at = datetime()
           MERGE (f)-[:EXTRACTED_FROM]->(s)
           MERGE (f)-[:SUPPORTS]->(t)
           MERGE (t)-[r:${rel}]->(mnode)
             ON CREATE SET r.value = $value, r.unit = $unit`,
          {
            srcId: srcId(src.url),
            url: src.url,
            title: src.title,
            srcType: src.type,
            techId: techId(m.technique),
            technique: m.technique,
            metricId: metricId(m.metric),
            metricName: metric.name,
            unit: metric.unit,
            hib: metric.higher_is_better,
            findId: fId,
            text: `${m.technique}: ${m.raw_text}`,
            value: m.value,
            rawText: m.raw_text,
            runId: run_id,
          },
          env,
        );
        nodes += 1;
        edges += 3;
      }
    }

    await jobsUpdate(ctx.db, jobId, {
      status: 'done',
      result_ref: JSON.stringify({ run_id, nodes, edges }),
    });
  } catch (e) {
    await jobsUpdate(ctx.db, jobId, { status: 'error', message: String(e) });
  }
}

interface Measurement {
  technique: string;
  metric: 'TOPS/W' | 'Memory_MB';
  value: number;
  raw_text: string;
}
interface Fixture {
  url: string;
  title: string;
  type: 'paper' | 'pasted';
  measurements: Measurement[];
}

// 2-3 fixed sources, each carrying BOTH a TOPS/W and a Memory_MB figure per
// technique so the Pareto job never comes up short (per PHASE0_DECISIONS Q3).
const FIXTURES: Record<string, Fixture> = {
  'arxiv:tops-per-watt-survey': {
    url: 'https://arxiv.org/abs/tops-per-watt-survey',
    title: 'TOPS/W Survey',
    type: 'paper',
    measurements: [
      { technique: 'INT4 Quantization', metric: 'TOPS/W', value: 4.2, raw_text: 'reports 4.2 TOPS/W at 2W' },
      { technique: 'INT4 Quantization', metric: 'Memory_MB', value: 1.5, raw_text: '1.5 MB on-chip footprint' },
      { technique: 'Mixed-Precision Scheduling', metric: 'TOPS/W', value: 3.1, raw_text: '3.1 TOPS/W sustained' },
      { technique: 'Mixed-Precision Scheduling', metric: 'Memory_MB', value: 2.4, raw_text: '2.4 MB working set' },
    ],
  },
  'arxiv:edge-accelerator-thermal-2025': {
    url: 'https://arxiv.org/abs/edge-accelerator-thermal-2025',
    title: 'Edge Accelerator Thermal 2025',
    type: 'paper',
    measurements: [
      { technique: 'Structured Sparsity', metric: 'TOPS/W', value: 2.6, raw_text: '2.6 TOPS/W at iso-throughput' },
      { technique: 'Structured Sparsity', metric: 'Memory_MB', value: 0.9, raw_text: '0.9 MB after 2:4 pruning' },
    ],
  },
  'internal:memory-constrained-inference': {
    url: 'internal://memory-constrained-inference',
    title: 'Memory-Constrained Inference Notes',
    type: 'pasted',
    measurements: [
      { technique: 'Weight Streaming', metric: 'TOPS/W', value: 1.8, raw_text: '1.8 TOPS/W with DMA overlap' },
      { technique: 'Weight Streaming', metric: 'Memory_MB', value: 0.5, raw_text: '0.5 MB resident weights' },
    ],
  },
};
