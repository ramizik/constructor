import { RESEARCH_GOAL, type Job } from '../types';

interface Props {
  jobs: Job[];
  busy: boolean;
  onScout: () => void;
  onAnalyze: () => void;
}

const statusColor: Record<Job['status'], string> = {
  pending: 'text-slate-400',
  running: 'text-sky-400',
  done: 'text-emerald-400',
  error: 'text-red-400',
};

export function LeftPanel({ jobs, busy, onScout, onAnalyze }: Props) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h1 className="text-sm font-semibold tracking-wide text-sky-400">CONSTRUCTOR</h1>
        <p className="text-[11px] text-slate-500">Graph-native Research Command Center</p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Research Goal
        </div>
        <p className="text-xs leading-relaxed text-slate-200">{RESEARCH_GOAL}</p>
      </div>

      <div className="space-y-2">
        <button
          onClick={onScout}
          disabled={busy}
          className="w-full rounded-md bg-emerald-500/90 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          Scout
        </button>
        <button
          onClick={onAnalyze}
          disabled={busy}
          className="w-full rounded-md bg-orange-500/90 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-orange-400 disabled:opacity-40"
        >
          Analyze
        </button>
        <button
          disabled
          title="Planner is a stretch goal"
          className="w-full cursor-not-allowed rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-600"
        >
          Plan Next
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Task Queue
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto">
          {jobs.length === 0 && (
            <p className="text-xs text-slate-600">No jobs yet. Click Scout to start.</p>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-xs"
            >
              <span className="capitalize text-slate-300">{job.type}</span>
              <span className={`font-medium ${statusColor[job.status]}`}>
                {job.status === 'running' && '● '}
                {job.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
