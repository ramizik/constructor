import type {
  AnalyzeParams,
  Artifact,
  ConstructorService,
  Finding,
  GraphData,
  Job,
  ScoutParams,
  ServiceEvent,
} from '../types';
import {
  analyzeArtifact,
  analyzeGraph,
  scoutFindings,
  scoutFindingsGraph,
  seedGraph,
} from './mockData';

// In-memory, event-driven fake backend. Mirrors the shape of the real
// Butterbase-backed service so swapping is a one-line change in service/index.ts.
export class MockService implements ConstructorService {
  private graph: GraphData = clone(seedGraph);
  private findings: Finding[] = [];
  private jobs: Job[] = [];
  private artifacts = new Map<string, Artifact>();
  private listeners = new Set<(e: ServiceEvent) => void>();

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

  async triggerScout(params: ScoutParams) {
    const job = this.newJob('scout', params);
    this.runJob(job, async () => {
      this.mergeGraph(scoutFindingsGraph);
      this.emit({ kind: 'graph', graph: clone(this.graph) });
      for (const f of scoutFindings) {
        this.findings.unshift(f);
        this.emit({ kind: 'finding', finding: f });
      }
    });
    return { job_id: job.id };
  }

  async triggerAnalyze(params: AnalyzeParams) {
    const job = this.newJob('analyze', params);
    this.runJob(
      job,
      async () => {
        this.mergeGraph(analyzeGraph);
        this.emit({ kind: 'graph', graph: clone(this.graph) });
        const ref = 'artifact_mock_1';
        this.artifacts.set(ref, analyzeArtifact);
        job.result_ref = ref;
        this.emit({ kind: 'artifact', ref, artifact: analyzeArtifact });
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
