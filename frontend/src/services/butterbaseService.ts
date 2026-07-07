import { createClient, type RealtimeChange } from '@butterbase/sdk';
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

// Real backend. Talks to Butterbase Functions + Postgres (jobs table) + Realtime.
// Contracts (agree with the team):
//   functions: trigger-scout, trigger-analyze, get-graph, get-findings, get-artifact
//   table:     jobs  (realtime enabled)
export class ButterbaseService implements ConstructorService {
  private client = createClient({
    appId: import.meta.env.VITE_BUTTERBASE_APP_ID as string,
    apiUrl:
      (import.meta.env.VITE_BUTTERBASE_API_URL as string) || 'https://api.butterbase.ai',
    anonKey: import.meta.env.VITE_BUTTERBASE_ANON_KEY as string | undefined,
  });

  private async invoke<T>(fn: string, body?: unknown): Promise<T> {
    const { data, error } = await this.client.functions.invoke<T>(fn, {
      body,
      method: 'POST',
    });
    if (error) throw new Error(`${fn} failed: ${error.message}`);
    return data as T;
  }

  async getGraph() {
    return this.invoke<GraphData>('get-graph');
  }
  async getFindings() {
    return this.invoke<Finding[]>('get-findings');
  }
  async getJobs() {
    return this.invoke<Job[]>('get-jobs');
  }
  async getArtifact(ref: string) {
    return this.invoke<Artifact | null>('get-artifact', { ref });
  }
  async getRunHistory() {
    // get-run-history is a stretch Function (ROADMAP contract 2b) that may not
    // be deployed yet — degrade to an empty trend rather than breaking the UI.
    try {
      return await this.invoke<RunHistoryPoint[]>('get-run-history');
    } catch {
      return [];
    }
  }
  async triggerScout(params: ScoutParams) {
    return this.invoke<ScoutResult>('trigger-scout', params);
  }
  async triggerAnalyze(params: AnalyzeParams) {
    return this.invoke<{ job_id: string }>('trigger-analyze', params);
  }

  subscribe(cb: (e: ServiceEvent) => void) {
    // Realtime on the `jobs` table. When a job flips to `done`, refetch the
    // graph/artifact so the canvas + right panel update live.
    this.client.realtime.connect();
    const sub = this.client.realtime.on('jobs', (change: RealtimeChange) => {
      if (change.op === 'DELETE' || !change.record) return;
      const job = change.record as unknown as Job;
      cb({ kind: 'job', job });
      if (job.status === 'done') {
        // Both agents grow the graph; refetch it.
        void this.getGraph().then((graph) => cb({ kind: 'graph', graph }));
        // Only analyze jobs point result_ref at an artifact id. Scout's
        // result_ref is a JSON summary ({ run_id, nodes, edges }), not an id.
        if (job.type === 'analyze' && job.result_ref) {
          void this.getArtifact(job.result_ref).then((artifact) => {
            if (artifact) cb({ kind: 'artifact', ref: job.result_ref!, artifact });
          });
        }
      }
    });
    return () => sub.unsubscribe();
  }
}

export type { Artifact };
