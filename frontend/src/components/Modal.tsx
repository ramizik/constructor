import { useState } from 'react';
import { type AnalyzeParams } from '../types';

interface AnalyzeModalProps {
  onClose: () => void;
  onSubmit: (p: AnalyzeParams) => void;
}

export function AnalyzeModal({ onClose, onSubmit }: AnalyzeModalProps) {
  const [jobType, setJobType] = useState<AnalyzeParams['jobType']>('pareto');
  const [note, setNote] = useState('');

  return (
    <Shell title="Run Analysis" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        Send current findings to a Daytona sandbox job and write results back to the graph.
      </p>
      <label className="block text-xs text-slate-500">Job type</label>
      <select
        value={jobType}
        onChange={(e) => setJobType(e.target.value as AnalyzeParams['jobType'])}
        className="mt-1 w-full rounded bg-white px-2 py-1.5 text-sm text-slate-800 outline-none ring-1 ring-slate-300 focus:ring-sky-500"
      >
        <option value="pareto">Pareto chart (TOPS/W vs Memory)</option>
        <option value="ranking">Comparative ranking table (fallback)</option>
      </select>
      <label className="mt-4 block text-xs text-slate-500">Note (optional)</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-1 w-full rounded bg-white px-2 py-1.5 text-sm text-slate-800 outline-none ring-1 ring-slate-300 focus:ring-sky-500"
      />
      <Actions
        onClose={onClose}
        onSubmit={() => onSubmit({ jobType, note: note || undefined })}
        label="Run Analysis"
      />
    </Shell>
  );
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40"
      onClick={onClose}
    >
      <div
        className="w-[380px] rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Actions({
  onClose,
  onSubmit,
  label,
  disabled,
}: {
  onClose: () => void;
  onSubmit: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        onClick={onClose}
        className="rounded px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  );
}
