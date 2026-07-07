import {
  NODE_COLORS,
  type Artifact,
  type Finding,
  type GraphData,
  type GraphNode,
  type Job,
  type NodeType,
  type RunHistoryPoint,
} from '../types';

interface Props {
  analyzeRuns: Job[];
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  artifacts: Record<string, Artifact>;
  runHistory: RunHistoryPoint[];
  findings: Finding[];
  selectedNode: GraphNode | null;
  graph: GraphData;
  onClearSelection: () => void;
}

export function RightPanel({
  analyzeRuns,
  selectedRunId,
  onSelectRun,
  artifacts,
  runHistory,
  findings,
  selectedNode,
  graph,
  onClearSelection,
}: Props) {
  const selectedRun = analyzeRuns.find((r) => r.id === selectedRunId) ?? null;
  const selectedArtifact =
    selectedRun && selectedRun.result_ref ? artifacts[selectedRun.result_ref] ?? null : null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {selectedNode && (
        <Section title="Selected Node" onClose={onClearSelection}>
          <NodeDetail node={selectedNode} graph={graph} />
        </Section>
      )}

      <Section title="Analyze Runs">
        {analyzeRuns.length === 0 ? (
          <Empty>No runs yet. Click Analyze to create one.</Empty>
        ) : (
          <div className="space-y-1.5">
            {analyzeRuns.map((run, i) => {
              const active = run.id === selectedRunId;
              const label =
                (run.params as { seed?: boolean })?.seed || i === analyzeRuns.length - 1
                  ? 'Seed run'
                  : `Run #${analyzeRuns.length - 1 - i}`;
              return (
                <button
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  className={`flex w-full items-center justify-between rounded border px-2.5 py-2 text-left text-xs transition-colors ${
                    active
                      ? 'border-sky-400 bg-sky-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="flex flex-col">
                    <span className={active ? 'text-sky-700' : 'text-slate-600'}>{label}</span>
                    <span className="text-[10px] text-slate-400">{relTime(run.created_at)}</span>
                  </span>
                  <StatusBadge status={run.status} />
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {selectedRun && (
        <Section title="Run Detail">
          {selectedArtifact ? (
            <ArtifactView artifact={selectedArtifact} />
          ) : selectedRun.status === 'running' || selectedRun.status === 'pending' ? (
            <Empty>Run in progress — artifact incoming…</Empty>
          ) : selectedRun.message ? (
            <p className="text-xs text-red-600">{selectedRun.message}</p>
          ) : (
            <Empty>No artifact for this run.</Empty>
          )}
          <TrendSparkline points={runHistory} selectedRunId={selectedRunId} />
        </Section>
      )}

      <Section title="Findings Feed">
        {findings.length === 0 ? (
          <Empty>No findings yet.</Empty>
        ) : (
          <div className="space-y-2">
            {findings.map((f) => (
              <div
                key={f.id}
                className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs"
              >
                <p className="text-slate-700">{f.text}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                  {f.value != null && (
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700">
                      {f.value}
                      {f.unit ? ` ${f.unit}` : ''}
                    </span>
                  )}
                  {f.technique && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700">
                      {f.technique}
                    </span>
                  )}
                  {f.source && (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">
                      {f.source}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function TrendSparkline({
  points,
  selectedRunId,
}: {
  points: RunHistoryPoint[];
  selectedRunId: string | null;
}) {
  const ordered = [...points].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  if (ordered.length < 2) return null;

  const W = 288, H = 56, pad = 8;
  const vals = ordered.map((p) => p.best_tops_w);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const x = (i: number) => pad + (i / (ordered.length - 1)) * (W - 2 * pad);
  const y = (v: number) => (max === min ? H / 2 : H - pad - ((v - min) / (max - min)) * (H - 2 * pad));
  const d = ordered.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.best_tops_w).toFixed(1)}`).join(' ');
  const latest = ordered[ordered.length - 1];

  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
        <span className="font-semibold uppercase tracking-wide">Leading TOPS/W · trend</span>
        <span className="text-emerald-600">
          {latest.best_technique} · {latest.best_tops_w}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <path d={d} fill="none" stroke="#0284c7" strokeWidth="1.5" />
        {ordered.map((p, i) => (
          <circle
            key={p.run_id}
            cx={x(i)}
            cy={y(p.best_tops_w)}
            r={p.run_id === selectedRunId ? 4 : 2.5}
            fill={p.run_id === selectedRunId ? '#db2777' : '#0284c7'}
          />
        ))}
      </svg>
    </div>
  );
}

function ArtifactView({ artifact }: { artifact: Artifact }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-medium text-slate-700">{artifact.title}</div>
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
                <tr key={i} className="border-t border-slate-200 text-slate-600">
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
        <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] italic text-emerald-600">
          {artifact.takeaway}
        </p>
      )}
    </div>
  );
}

function NodeDetail({ node, graph }: { node: GraphNode; graph: GraphData }) {
  const color = NODE_COLORS[node.type] ?? '#94a3b8';
  const skip = new Set(['id', 'created_at']);
  const props = node.props
    ? Object.entries(node.props).filter(([k, v]) => !skip.has(k) && v != null && v !== '')
    : [];

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const connections = graph.edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const outgoing = e.source === node.id;
      const other = byId.get(outgoing ? e.target : e.source);
      return { rel: e.type, outgoing, other };
    })
    .filter((c) => c.other);

  return (
    <div
      className="rounded-lg border bg-white p-3 text-xs"
      style={{ borderColor: color + '66' }}
    >
      <div className="mb-2 flex items-start gap-2">
        <span
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}99` }}
        />
        <span className="font-semibold leading-snug text-slate-800">{node.label}</span>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: color + '22', color }}
        >
          {node.type}
        </span>
        <span className="text-[10px] text-slate-400">
          {connections.length} connection{connections.length === 1 ? '' : 's'}
        </span>
      </div>

      {props.length > 0 && (
        <dl className="mt-2 space-y-1 border-t border-slate-200 pt-2">
          {props.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-24 shrink-0 truncate text-slate-500">{k}</dt>
              <dd className="truncate font-medium text-slate-700">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {connections.length > 0 && (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Connections
          </div>
          <div className="space-y-1">
            {connections.map((c, i) => {
              const oc = NODE_COLORS[c.other!.type as NodeType] ?? '#94a3b8';
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[9px] text-slate-400">
                    {c.outgoing ? '→' : '←'}
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-500">
                    {c.rel}
                  </span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: oc }}
                  />
                  <span className="truncate text-[10px] text-slate-600">
                    {c.other!.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-2 truncate text-[10px] text-slate-400">{node.id}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Job['status'] }) {
  const map: Record<Job['status'], string> = {
    pending: 'bg-slate-200 text-slate-600',
    running: 'bg-sky-100 text-sky-700',
    done: 'bg-emerald-100 text-emerald-700',
    error: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[status]}`}>
      {status === 'running' && '● '}
      {status}
    </span>
  );
}

function Section({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-400">{children}</p>;
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
