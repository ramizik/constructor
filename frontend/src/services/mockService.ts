import type {
  AnalyzeParams,
  Artifact,
  ConstructorService,
  Finding,
  GraphData,
  Job,
  RunHistoryPoint,
  ScoutParams,
  ScoutResult,
  ServiceEvent,
} from '../types';
import {
  TECHS,
  bestByTops,
  buildAnalyzeArtifact,
  buildAnalyzeGraph,
  buildRankingArtifact,
  scoutBatches,
  seedGraph,
  type Tech,
} from './mockData';

// In-memory, event-driven fake backend. Mirrors the shape of the real
// Butterbase-backed service so swapping is a one-line change in service/index.ts.
export class MockService implements ConstructorService {
  private graph: GraphData = clone(seedGraph);
  private findings: Finding[] = [];
  private jobs: Job[] = [];
  private artifacts = new Map<string, Artifact>();
  private listeners = new Set<(e: ServiceEvent) => void>();
  private runHistory: RunHistoryPoint[] = [];
  private ingested = new Set<string>();
  private availableTechs: Tech[] = [];
  private runN = 0;

  constructor() {
    // Seed the graph's known technique (INT4) so Analyze has something to rank
    // before Scout runs, and seed one prior run so the history list isn't empty.
    const seedTech = TECHS.find((t) => t.id === 'tech_int4-quantization');
    if (seedTech) this.availableTechs.push(seedTech);

    const seedRef = 'artifact_mock_seed';
    const seedArtifact = buildAnalyzeArtifact(this.availableTechs, 'seed run');
    this.artifacts.set(seedRef, seedArtifact);
    const seedJob: Job = {
      id: 'job_seed_analyze',
      type: 'analyze',
      status: 'done',
      params: { jobType: 'pareto', seed: true },
      result_ref: seedRef,
      created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    };
    this.jobs.push(seedJob);
    if (seedTech) {
      this.runHistory.push({
        run_id: seedJob.id,
        created_at: seedJob.created_at,
        best_technique: seedTech.name,
        best_tops_w: seedTech.tops,
      });
    }
  }

  async getGraph() {
    return clone(this.graph);
  }
  async getFindings() {
    return clone(this.findings);
  }
  async getJobs() {
    return clone(this.jobs);
  }
  async getArtifact(ref: string) {
    return this.artifacts.get(ref) ?? null;
  }
  async getRunHistory() {
    return clone(this.runHistory);
  }

  async triggerScout(params: ScoutParams): Promise<ScoutResult> {
    // Auto-mode (toggle tick): ingest the next un-ingested fixed source only.
    if (params.mode === 'auto') {
      const batch = scoutBatches.find((b) => !this.ingested.has(b.source));
      const job = this.newJob('scout', params);
      if (!batch) {
        // Pool exhausted — harmless no-op tick, signals the toggle to stop.
        this.runJob(job, async () => {});
        return { job_id: job.id, nodes: 0, edges: 0, done: true };
      }
      this.ingested.add(batch.source);
      for (const t of batch.techs) if (!this.availableTechs.includes(t)) this.availableTechs.push(t);
      this.runJob(job, async () => {
        this.mergeGraph(batch.graph);
        this.emit({ kind: 'graph', graph: clone(this.graph) });
        for (const f of batch.findings) {
          this.findings.unshift(f);
          this.emit({ kind: 'finding', finding: f });
        }
      });
      return { job_id: job.id, nodes: batch.graph.nodes.length, edges: batch.graph.edges.length, done: false };
    }

    // Explicit / one-shot mode (original behavior): ingest everything at once.
    const job = this.newJob('scout', params);
    for (const b of scoutBatches) {
      this.ingested.add(b.source);
      for (const t of b.techs) if (!this.availableTechs.includes(t)) this.availableTechs.push(t);
    }
    this.runJob(job, async () => {
      for (const b of scoutBatches) this.mergeGraph(b.graph);
      this.emit({ kind: 'graph', graph: clone(this.graph) });
      for (const b of scoutBatches) {
        for (const f of b.findings) {
          this.findings.unshift(f);
          this.emit({ kind: 'finding', finding: f });
        }
      }
    });
    return { job_id: job.id, done: true };
  }

  async triggerAnalyze(params: AnalyzeParams) {
    const job = this.newJob('analyze', params);
    const runN = ++this.runN;
    const pts = [...this.availableTechs];
    this.runJob(
      job,
      async () => {
        const { graph, artId } = buildAnalyzeGraph(runN, pts);
        this.mergeGraph(graph);
        this.emit({ kind: 'graph', graph: clone(this.graph) });
        const artifact =
          params.jobType === 'ranking'
            ? buildRankingArtifact(pts, `run #${runN}`)
            : buildAnalyzeArtifact(pts, `run #${runN}`);
        this.artifacts.set(artId, artifact);
        job.result_ref = artId;
        const best = bestByTops(pts);
        this.runHistory.push({
          run_id: job.id,
          created_at: new Date().toISOString(),
          best_technique: best.name,
          best_tops_w: best.tops,
        });
        this.emit({ kind: 'artifact', ref: artId, artifact });
      },
      1400,
    );
    return { job_id: job.id };
  }

  subscribe(cb: (e: ServiceEvent) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // --- internals -----------------------------------------------------------
  private newJob(type: Job['type'], params: object): Job {
    const job: Job = {
      id: `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      status: 'pending',
      params: params as Record<string, unknown>,
      result_ref: null,
      created_at: new Date().toISOString(),
    };
    this.jobs.unshift(job);
    this.emit({ kind: 'job', job: clone(job) });
    return job;
  }

  private runJob(job: Job, work: () => Promise<void>, workDelay = 900) {
    setTimeout(() => {
      job.status = 'running';
      this.emit({ kind: 'job', job: clone(job) });
      setTimeout(async () => {
        try {
          await work();
          job.status = 'done';
        } catch (err) {
          job.status = 'error';
          job.message = String(err);
        }
        this.emit({ kind: 'job', job: clone(job) });
      }, workDelay);
    }, 400);
  }

  private mergeGraph(add: GraphData) {
    const nodeIds = new Set(this.graph.nodes.map((n) => n.id));
    const edgeIds = new Set(this.graph.edges.map((e) => e.id));
    for (const n of add.nodes) if (!nodeIds.has(n.id)) this.graph.nodes.push(clone(n));
    for (const e of add.edges) if (!edgeIds.has(e.id)) this.graph.edges.push(clone(e));
  }

  private emit(e: ServiceEvent) {
    for (const l of this.listeners) l(e);
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
