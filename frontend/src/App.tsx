import { useCallback, useEffect, useRef, useState } from 'react';
import { GraphCanvas } from './components/GraphCanvas';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { AnalyzeModal } from './components/Modal';
import { getService } from './services';
import {
  RESEARCH_GOAL,
  type AnalyzeParams,
  type Artifact,
  type Finding,
  type GraphData,
  type GraphNode,
  type Job,
  type RunHistoryPoint,
} from './types';

const service = getService();

// Scout toggle cadence (ROADMAP contract 2: ~20-30s demo pacing). Frontend-only
// setInterval, no backend scheduler — safe because trigger-scout is idempotent.
const SCOUT_TICK_MS = 20_000;

function sortRunsDesc(jobs: Job[]): Job[] {
  return jobs
    .filter((j) => j.type === 'analyze')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function App() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, Artifact>>({});
  const [runHistory, setRunHistory] = useState<RunHistoryPoint[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [modal, setModal] = useState<'analyze' | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [scoutOn, setScoutOn] = useState(false);
  const [scoutExhausted, setScoutExhausted] = useState(false);
  const [goal, setGoal] = useState<string>(RESEARCH_GOAL);

  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;

  const loadArtifact = useCallback(async (ref: string) => {
    const art = await service.getArtifact(ref);
    if (art) setArtifacts((cur) => ({ ...cur, [ref]: art }));
  }, []);

  // initial load
  useEffect(() => {
    service.getGraph().then(setGraph);
    service.getFindings().then(setFindings);
    service.getRunHistory().then(setRunHistory);
    service.getJobs().then((js) => {
      setJobs(js);
      const newest = sortRunsDesc(js)[0];
      if (newest) {
        setSelectedRunId(newest.id);
        if (newest.result_ref) void loadArtifact(newest.result_ref);
      }
    });
  }, [loadArtifact]);

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
          setArtifacts((cur) => ({ ...cur, [event.ref]: event.artifact }));
          break;
        case 'job':
          setJobs((cur) => {
            const idx = cur.findIndex((j) => j.id === event.job.id);
            if (idx === -1) return [event.job, ...cur];
            const next = [...cur];
            next[idx] = event.job;
            return next;
          });
          if (event.job.type === 'analyze' && event.job.status === 'done') {
            setSelectedRunId(event.job.id);
            if (event.job.result_ref) void loadArtifact(event.job.result_ref);
            service.getRunHistory().then(setRunHistory);
          }
          break;
      }
    });
  }, [loadArtifact]);

  // Scout toggle: client-side interval firing trigger-scout({mode:'auto'}).
  useEffect(() => {
    if (!scoutOn) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await service.triggerScout({ mode: 'auto' });
        if (cancelled) return;
        if (res.done) {
          setScoutExhausted(true);
          setScoutOn(false);
        }
      } catch {
        if (!cancelled) setScoutOn(false);
      }
    };
    void tick();
    const iv = setInterval(tick, SCOUT_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [scoutOn]);

  const analyzeRuns = sortRunsDesc(jobs);
  const analyzing = jobs.some(
    (j) =>
      j.type === 'analyze' &&
      (j.status === 'running' || j.status === 'pending') &&
      Date.now() - new Date(j.created_at).getTime() < 10 * 60 * 1000,
  );

  const onToggleScout = useCallback(() => {
    setScoutExhausted((exhausted) => {
      if (!exhausted) setScoutOn((v) => !v);
      return exhausted;
    });
  }, []);

  const onSelectRun = useCallback(
    (id: string) => {
      setSelectedRunId(id);
      const job = jobsRef.current.find((j) => j.id === id);
      if (job?.result_ref) void loadArtifact(job.result_ref);
    },
    [loadArtifact],
  );

  const runAnalyze = useCallback(async (params: AnalyzeParams) => {
    setModal(null);
    await service.triggerAnalyze(params);
  }, []);

  return (
    <div className="grid h-screen grid-cols-[280px_1fr_340px] bg-slate-50">
      <aside className="border-r border-slate-200 bg-white">
        <LeftPanel
          jobs={jobs}
          busy={analyzing}
          goal={goal}
          onGoalChange={setGoal}
          scoutOn={scoutOn}
          scoutExhausted={scoutExhausted}
          onToggleScout={onToggleScout}
          onAnalyze={() => setModal('analyze')}
        />
      </aside>

      <main className="relative">
        <div className="absolute left-3 top-3 z-10 rounded border border-slate-200 bg-white/80 px-2 py-1 text-[10px] text-slate-500 shadow-sm backdrop-blur">
          Knowledge Graph · {graph.nodes.length} nodes · {graph.edges.length} edges
        </div>
        <GraphCanvas
          graph={graph}
          selectedId={selectedNode?.id ?? null}
          onNodeClick={setSelectedNode}
        />
      </main>

      <aside className="border-l border-slate-200 bg-white">
        <RightPanel
          analyzeRuns={analyzeRuns}
          selectedRunId={selectedRunId}
          onSelectRun={onSelectRun}
          artifacts={artifacts}
          runHistory={runHistory}
          findings={findings}
          selectedNode={selectedNode}
          graph={graph}
          onClearSelection={() => setSelectedNode(null)}
        />
      </aside>

      {modal === 'analyze' && (
        <AnalyzeModal onClose={() => setModal(null)} onSubmit={runAnalyze} />
      )}
    </div>
  );
}
