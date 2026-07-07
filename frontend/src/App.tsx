import { useCallback, useEffect, useRef, useState } from 'react';
import { GraphCanvas } from './components/GraphCanvas';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { AnalyzeModal, ScoutModal } from './components/Modal';
import { getService } from './services';
import type {
  AnalyzeParams,
  Artifact,
  Finding,
  GraphData,
  Job,
  ScoutParams,
} from './types';

const service = getService();

export default function App() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [modal, setModal] = useState<'scout' | 'analyze' | null>(null);
  const activeJobId = useRef<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  // initial load
  useEffect(() => {
    service.getGraph().then(setGraph);
    service.getFindings().then(setFindings);
    service.getJobs().then(setJobs);
  }, []);

  // live subscription
  useEffect(() => {
    return service.subscribe((event) => {
      switch (event.kind) {
        case 'graph':
          setGraph(event.graph);
          break;
        case 'finding':
          setFindings((cur) => [event.finding, ...cur]);
          break;
        case 'artifact':
          setArtifact(event.artifact);
          break;
        case 'job':
          setJobs((cur) => {
            const idx = cur.findIndex((j) => j.id === event.job.id);
            if (idx === -1) return [event.job, ...cur];
            const next = [...cur];
            next[idx] = event.job;
            return next;
          });
          if (event.job.id === activeJobId.current) setActiveJob(event.job);
          break;
      }
    });
  }, []);

  const busy = activeJob?.status === 'pending' || activeJob?.status === 'running';

  const runScout = useCallback(async (params: ScoutParams) => {
    setModal(null);
    const { job_id } = await service.triggerScout(params);
    activeJobId.current = job_id;
  }, []);

  const runAnalyze = useCallback(async (params: AnalyzeParams) => {
    setModal(null);
    const { job_id } = await service.triggerAnalyze(params);
    activeJobId.current = job_id;
  }, []);

  return (
    <div className="grid h-screen grid-cols-[280px_1fr_340px] bg-[#0b0f17]">
      <aside className="border-r border-slate-800">
        <LeftPanel
          jobs={jobs}
          busy={busy}
          onScout={() => setModal('scout')}
          onAnalyze={() => setModal('analyze')}
        />
      </aside>

      <main className="relative">
        <div className="absolute left-3 top-3 z-10 rounded bg-slate-900/70 px-2 py-1 text-[10px] text-slate-400">
          Knowledge Graph · {graph.nodes.length} nodes · {graph.edges.length} edges
        </div>
        <GraphCanvas graph={graph} />
      </main>

      <aside className="border-l border-slate-800">
        <RightPanel activeJob={activeJob} findings={findings} artifact={artifact} />
      </aside>

      {modal === 'scout' && (
        <ScoutModal onClose={() => setModal(null)} onSubmit={runScout} />
      )}
      {modal === 'analyze' && (
        <AnalyzeModal onClose={() => setModal(null)} onSubmit={runAnalyze} />
      )}
    </div>
  );
}
