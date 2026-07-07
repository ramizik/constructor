import { useEffect, useRef, useState } from 'react';
import { type Job } from '../types';

interface Props {
  jobs: Job[];
  busy: boolean;
  goal: string;
  onGoalChange: (goal: string) => void;
  scoutOn: boolean;
  scoutExhausted: boolean;
  onToggleScout: () => void;
  onAnalyze: () => void;
}

const statusDot: Record<Job['status'], string> = {
  pending: 'bg-slate-500',
  running: 'bg-sky-400 animate-pulse',
  done: 'bg-emerald-400',
  error: 'bg-red-400',
};

const statusLabel: Record<Job['status'], string> = {
  pending: 'text-slate-400',
  running: 'text-sky-300',
  done: 'text-emerald-400',
  error: 'text-red-400',
};

const jobLabel: Record<Job['type'], string> = {
  scout: 'Scout',
  analyze: 'Daytona Analyze',
  plan: 'Plan',
};

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-sky-400/30 border-t-sky-400" />
  );
}

function GoalCard({
  goal,
  onGoalChange,
}: {
  goal: string;
  onGoalChange: (goal: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(goal);
    setEditing(true);
  };
  const save = () => {
    const next = draft.trim();
    if (next) onGoalChange(next);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(goal);
    setEditing(false);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Research Goal
        </span>
        {!editing && (
          <button
            onClick={startEdit}
            className="text-[10px] font-medium text-sky-400 hover:text-sky-300"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
              if (e.key === 'Escape') cancel();
            }}
            rows={4}
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950/60 p-2 text-xs leading-relaxed text-slate-100 outline-none focus:border-sky-500"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={cancel}
              className="rounded px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!draft.trim()}
              className="rounded bg-sky-500/90 px-2.5 py-1 text-[11px] font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p onClick={startEdit} className="cursor-text text-xs leading-relaxed text-slate-200">
          {goal}
        </p>
      )}
    </div>
  );
}

function ScoutToggle({
  on,
  exhausted,
  onToggle,
}: {
  on: boolean;
  exhausted: boolean;
  onToggle: () => void;
}) {
  const label = exhausted ? 'Scout · fully scouted' : on ? 'Scout · scanning…' : 'Scout';
  const help = exhausted
    ? 'All fixed sources ingested'
    : on
      ? 'Releasing one source per tick'
      : 'Toggle to grow the graph over time';

  return (
    <button
      onClick={onToggle}
      disabled={exhausted}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
        exhausted
          ? 'bg-slate-800 text-slate-500'
          : on
            ? 'bg-emerald-500/90 text-slate-950 hover:bg-emerald-400'
            : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
      }`}
    >
      <span className="flex items-center gap-2">
        {on && !exhausted && <Spinner />}
        <span className="flex flex-col items-start leading-tight">
          <span>{label}</span>
          <span className="text-[9px] font-normal opacity-70">{help}</span>
        </span>
      </span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          on && !exhausted ? 'bg-slate-950/40' : 'bg-slate-600/60'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
            on && !exhausted ? 'left-3.5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function LeftPanel({
  jobs,
  busy,
  goal,
  onGoalChange,
  scoutOn,
  scoutExhausted,
  onToggleScout,
  onAnalyze,
}: Props) {
  const running = jobs.filter((j) => j.status === 'running');

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h1 className="text-sm font-semibold tracking-wide text-sky-400">CONSTRUCTOR</h1>
        <p className="text-[11px] text-slate-500">Graph-native Research Command Center</p>
      </div>

      <GoalCard goal={goal} onGoalChange={onGoalChange} />

      <div className="space-y-2">
        <ScoutToggle on={scoutOn} exhausted={scoutExhausted} onToggle={onToggleScout} />
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
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            Daytona Jobs
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              running.length > 0
                ? 'bg-sky-500/15 text-sky-300'
                : 'bg-slate-800 text-slate-500'
            }`}
          >
            {running.length} running
          </span>
        </div>

        {running.length > 0 && (
          <div className="mb-2 rounded-lg border border-sky-800/40 bg-sky-500/5 px-2.5 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-sky-300">
              <Spinner />
              {running.length} concurrent job{running.length === 1 ? '' : 's'} on Daytona
            </div>
            <div className="space-y-1">
              {running.map((job) => (
                <div key={job.id} className="flex items-center gap-2 text-[11px]">
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-400" />
                  <span className="flex-1 truncate text-slate-200">{jobLabel[job.type]}</span>
                  <span className="shrink-0 font-mono text-[9px] text-sky-400/70">
                    #{job.id.slice(-4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
          History
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto">
          {jobs.length === 0 && (
            <p className="text-xs text-slate-600">No jobs yet. Click Scout to start.</p>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-xs"
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[job.status]}`} />
              <span className="flex-1 truncate text-slate-300">{jobLabel[job.type]}</span>
              <span className={`shrink-0 font-medium ${statusLabel[job.status]}`}>
                {job.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
