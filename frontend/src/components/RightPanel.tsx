import type { Artifact, Finding, Job } from '../types';

interface Props {
  activeJob: Job | null;
  findings: Finding[];
  artifact: Artifact | null;
}

export function RightPanel({ activeJob, findings, artifact }: Props) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <Section title="Job Status">
        {activeJob ? (
          <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs">
            <div className="flex justify-between">
              <span className="capitalize text-slate-300">{activeJob.type} job</span>
              <StatusBadge status={activeJob.status} />
            </div>
            {activeJob.message && (
              <p className="mt-1 text-red-400">{activeJob.message}</p>
            )}
          </div>
        ) : (
          <Empty>Idle. No job running.</Empty>
        )}
      </Section>

      <Section title="Findings Feed">
        {findings.length === 0 ? (
          <Empty>No findings yet.</Empty>
        ) : (
          <div className="space-y-2">
            {findings.map((f) => (
              <div
                key={f.id}
                className="rounded border border-slate-800 bg-slate-900/60 p-2.5 text-xs"
              >
                <p className="text-slate-200">{f.text}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                  {f.value != null && (
                    <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-yellow-300">
                      {f.value}
                      {f.unit ? ` ${f.unit}` : ''}
                    </span>
                  )}
                  {f.technique && (
                    <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">
                      {f.technique}
                    </span>
                  )}
                  {f.source && (
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-300">
                      {f.source}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Latest Artifact">
        {artifact ? <ArtifactView artifact={artifact} /> : <Empty>No artifact yet.</Empty>}
      </Section>
    </div>
  );
}

function ArtifactView({ artifact }: { artifact: Artifact }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 text-xs font-medium text-slate-200">{artifact.title}</div>
      {artifact.kind === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-500">
                {artifact.columns.map((c) => (
                  <th key={c} className="pb-1 pr-2 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {artifact.rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-800 text-slate-300">
                  {row.map((cell, j) => (
                    <td key={j} className="py-1 pr-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <img src={artifact.image_url} alt={artifact.title} className="w-full rounded" />
      )}
      {artifact.takeaway && (
        <p className="mt-2 border-t border-slate-800 pt-2 text-[11px] italic text-emerald-300">
          {artifact.takeaway}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Job['status'] }) {
  const map: Record<Job['status'], string> = {
    pending: 'bg-slate-700 text-slate-300',
    running: 'bg-sky-500/20 text-sky-300',
    done: 'bg-emerald-500/20 text-emerald-300',
    error: 'bg-red-500/20 text-red-300',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[status]}`}>
      {status === 'running' && '● '}
      {status}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-600">{children}</p>;
}
