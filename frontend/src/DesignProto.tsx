import { useCallback, useEffect, useRef, useState } from 'react';
import { getService } from './services';
import { AnalyzeModal } from './components/Modal';
import { GraphCanvas } from './components/GraphCanvas';
import type {
  Artifact, Finding, GraphData, GraphNode,
  Job, NodeType, RunHistoryPoint, AnalyzeParams, ScoutResult,
} from './types';

const service = getService();

// ── Light-mode color tokens ───────────────────────────────────────────────────
const V = {
  bg:       '#f8fafc',
  panel:    '#ffffff',
  card:     '#f8fafc',
  border:   '#e2e8f0',
  borderHi: '#cbd5e1',
  cyan:     '#0284c7',
  cyanL:    '#e0f2fe',
  emerald:  '#059669',
  emeraldL: '#d1fae5',
  amber:    '#d97706',
  amberL:   '#fef3c7',
  pink:     '#db2777',
  textHi:   '#0f172a',
  textMid:  '#475569',
  textLo:   '#94a3b8',
} as const;

const JBM = "'JetBrains Mono', 'Fira Mono', monospace";
const SAN = "ui-sans-serif, system-ui, sans-serif";

// ── Node type colors (work on light bg) ──────────────────────────────────────
const NC: Record<NodeType, string> = {
  ResearchGoal:   '#ec4899',
  Technique:      '#0ea5e9',
  Metric:         '#eab308',
  Source:         '#8b5cf6',
  Finding:        '#22c55e',
  ExperimentRun:  '#f97316',
  ResultArtifact: '#ef4444',
  AgentTask:      '#64748b',
};

// ── CSS animations ────────────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes dp-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
@keyframes dp-pulse { 0%,100%{box-shadow:0 0 4px rgba(2,132,199,.3)} 50%{box-shadow:0 0 12px rgba(2,132,199,.6)} }
@keyframes dp-am    { 0%,100%{box-shadow:0 2px 8px rgba(217,119,6,.25)} 50%{box-shadow:0 2px 18px rgba(217,119,6,.5)} }
@keyframes dp-slide     { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
@keyframes dp-slidedown { from{opacity:0;transform:translateX(-50%) translateY(-12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
@keyframes dp-spin      { to{transform:rotate(360deg)} }
.dp-blink { animation:dp-blink 1.8s ease-in-out infinite; }
.dp-pulse { animation:dp-pulse 2.2s ease-in-out infinite; }
.dp-am    { animation:dp-am    2.2s ease-in-out infinite; }
.dp-slide { animation:dp-slide  .2s ease-out; }
.dp-spin  { animation:dp-spin   .9s linear infinite; display:inline-block; }
`;

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const W = 320, H = 48, pad = 6;
  const mn = Math.min(...pts), mx = Math.max(...pts);
  const xi = (i: number) => pad + (i / (pts.length - 1)) * (W - 2 * pad);
  const yi = (v: number) => H - pad - ((v - mn) / ((mx - mn) || 1)) * (H - 2 * pad);
  const d  = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i).toFixed(1)},${yi(v).toFixed(1)}`).join(' ');
  const fill = d + ` L${xi(pts.length - 1).toFixed(1)},${H} L${xi(0).toFixed(1)},${H} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="spark-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={V.cyan} stopOpacity="0.2" />
          <stop offset="100%" stopColor={V.cyan} stopOpacity="0"   />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spark-g)" />
      <path d={d} fill="none" stroke={V.cyan} strokeWidth="1.5" />
      {pts.map((v, i) => (
        <circle key={i} cx={xi(i)} cy={yi(v)} r={i === pts.length - 1 ? 4 : 2.5}
          fill={i === pts.length - 1 ? V.emerald : V.cyan} />
      ))}
    </svg>
  );
}

// ── Sec label style ───────────────────────────────────────────────────────────
const secLabelStyle: React.CSSProperties = {
  fontFamily: JBM, fontSize: 9, fontWeight: 600,
  letterSpacing: '0.11em', textTransform: 'uppercase', color: V.textLo,
};

const cardStyle: React.CSSProperties = {
  background: V.card, border: `1px solid ${V.border}`, borderRadius: 8,
};

// ── Main component ────────────────────────────────────────────────────────────
export default function DesignProto() {
  const [graph,        setGraph]        = useState<GraphData>({ nodes: [], edges: [] });
  const [jobs,         setJobs]         = useState<Job[]>([]);
  const [findings,     setFindings]     = useState<Finding[]>([]);
  const [artifacts,    setArtifacts]    = useState<Record<string, Artifact>>({});
  const [runHistory,   setRunHistory]   = useState<RunHistoryPoint[]>([]);
  const [selectedRunId,setSelectedRunId]= useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [scoutOn,      setScoutOn]      = useState(false);
  const [scoutExhausted, setScoutExhausted] = useState(false);
  const [modal,        setModal]        = useState(false);
  const [time,         setTime]         = useState(new Date());
  const [goalText,     setGoalText]     = useState('Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators.');
  const [editingGoal,  setEditingGoal]  = useState(false);
  const [goalDraft,    setGoalDraft]    = useState('');
  const goalRef = useRef<HTMLTextAreaElement>(null);

  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;

  // inject CSS
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);

  // clock
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // initial load
  useEffect(() => {
    service.getGraph().then(setGraph);
    service.getFindings().then(setFindings);
    service.getRunHistory().then(setRunHistory);
    service.getJobs().then(js => {
      setJobs(js);
      const newest = js.filter(j => j.type === 'analyze')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (newest) {
        setSelectedRunId(newest.id);
        if (newest.result_ref) {
          service.getArtifact(newest.result_ref).then(a => {
            if (a) setArtifacts(cur => ({ ...cur, [newest.result_ref!]: a }));
          });
        }
      }
    });
  }, []);

  // realtime
  useEffect(() => {
    return service.subscribe(ev => {
      switch (ev.kind) {
        case 'graph':    setGraph(ev.graph); break;
        case 'finding':  setFindings(cur => [ev.finding, ...cur]); break;
        case 'artifact': setArtifacts(cur => ({ ...cur, [ev.ref]: ev.artifact })); break;
        case 'job':
          setJobs(cur => {
            const idx = cur.findIndex(j => j.id === ev.job.id);
            if (idx === -1) return [ev.job, ...cur];
            const next = [...cur]; next[idx] = ev.job; return next;
          });
          if (ev.job.type === 'analyze' && ev.job.status === 'done') {
            setSelectedRunId(ev.job.id);
            if (ev.job.result_ref)
              service.getArtifact(ev.job.result_ref).then(a => {
                if (a) setArtifacts(cur => ({ ...cur, [ev.job.result_ref!]: a }));
              });
            service.getRunHistory().then(setRunHistory);
          }
          break;
      }
    });
  }, []);

  // Scout auto-tick
  useEffect(() => {
    if (!scoutOn) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res: ScoutResult = await service.triggerScout({ mode: 'auto' });
        if (cancelled) return;
        if (res.done) { setScoutExhausted(true); setScoutOn(false); }
      } catch { if (!cancelled) setScoutOn(false); }
    };
    void tick();
    const iv = setInterval(tick, 20_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [scoutOn]);

  const runAnalyze = useCallback(async (params: AnalyzeParams) => {
    setModal(false);
    await service.triggerAnalyze(params);
  }, []);

  // derived
  const analyzing = jobs.some(j =>
    j.type === 'analyze' &&
    (j.status === 'running' || j.status === 'pending') &&
    Date.now() - new Date(j.created_at).getTime() < 10 * 60 * 1000,
  );
  const running   = jobs.filter(j => j.status === 'running');
  const analyzeRuns = jobs
    .filter(j => j.type === 'analyze')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const selectedRun = analyzeRuns.find(r => r.id === selectedRunId) ?? null;
  const artifact   = selectedRun?.result_ref ? artifacts[selectedRun.result_ref] ?? null : null;
  const sparkPts   = runHistory.map(p => p.best_tops_w ?? 0).filter(Boolean);

  const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: V.bg, color: V.textHi, fontFamily: SAN }}>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header style={{
        background: V.panel,
        borderBottom: `1px solid ${V.border}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', height: 52, flexShrink: 0, gap: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 20 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 25,8 25,20 14,26 3,20 3,8" fill={V.cyan} opacity="0.15" stroke={V.cyan} strokeWidth="1.5"/>
            <polygon points="14,7 21,11 21,17 14,21 7,17 7,11" fill={V.cyan} opacity="0.25" stroke={V.cyan} strokeWidth="1"/>
            <circle cx="14" cy="14" r="3" fill={V.cyan}/>
          </svg>
          <span style={{ fontSize: 15, fontWeight: 800, color: V.textHi, letterSpacing: '-0.01em', fontFamily: SAN }}>
            Constructor
          </span>
        </div>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: SAN, fontSize: 13, color: V.textLo, marginRight: 24 }}>
          <span style={{ color: V.textLo }}>Research</span>
          <span style={{ color: V.borderHi }}>/</span>
          <span style={{ color: V.textMid, fontWeight: 500 }}>Edge Inference Optimization</span>
        </div>

        <Div />

        {/* Status pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 10px 3px 7px' }}>
            <span className="dp-blink" style={{ width: 6, height: 6, borderRadius: '50%', background: V.emerald, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: V.emerald, fontFamily: SAN }}>Live</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: V.cyanL, border: `1px solid #bae6fd`, borderRadius: 20, padding: '3px 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: V.cyan, fontFamily: JBM }}>{graph.nodes.length} nodes</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: V.card, border: `1px solid ${V.border}`, borderRadius: 20, padding: '3px 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: V.textMid, fontFamily: JBM }}>{graph.edges.length} edges</span>
          </div>
        </div>

        {/* Right side */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {analyzing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: V.amberL, border: `1px solid #fcd34d`, borderRadius: 20, padding: '4px 12px' }}>
              <span className="dp-spin" style={{ fontSize: 11, color: V.amber }}>⟳</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: V.amber, fontFamily: SAN }}>Analyzing</span>
            </div>
          )}
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: V.textLo, fontFamily: JBM }}>{timeStr}</span>
          </div>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg, ${V.cyan}, #7c3aed)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: SAN, flexShrink: 0 }}>
            R
          </div>
        </div>
      </header>

      {/* ── 3-col grid ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '296px 1fr 356px', flex: 1, minHeight: 0 }}>

        {/* ── LEFT ──────────────────────────────────────────────────────── */}
        <aside style={{
          borderRight: `1px solid ${V.border}`, background: V.panel,
          display: 'flex', flexDirection: 'column', gap: 14, padding: 16,
          overflowY: 'auto', overflowX: 'hidden',
        }}>
          {/* Goal card — editable */}
          <div style={{ ...cardStyle, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={secLabelStyle}>Research Goal</div>
              {!editingGoal && (
                <button
                  onClick={() => { setGoalDraft(goalText); setEditingGoal(true); setTimeout(() => goalRef.current?.focus(), 0); }}
                  style={{ fontFamily: JBM, fontSize: 9, color: V.cyan, background: 'none', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.06em' }}
                >
                  EDIT
                </button>
              )}
            </div>

            {editingGoal ? (
              <div>
                <textarea
                  ref={goalRef}
                  value={goalDraft}
                  onChange={e => setGoalDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { setGoalText(goalDraft.trim() || goalText); setEditingGoal(false); }
                    if (e.key === 'Escape') setEditingGoal(false);
                  }}
                  rows={4}
                  style={{
                    width: '100%', resize: 'none', borderRadius: 6, padding: '8px 10px',
                    border: `1.5px solid ${V.cyan}`, outline: 'none',
                    fontSize: 12, lineHeight: 1.6, color: V.textHi, fontFamily: SAN,
                    background: '#fff', boxSizing: 'border-box',
                    boxShadow: `0 0 0 3px ${V.cyanL}`,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                  <button onClick={() => setEditingGoal(false)} style={{ fontSize: 11, color: V.textLo, background: 'none', border: 'none', cursor: 'pointer', fontFamily: SAN }}>Cancel</button>
                  <button
                    onClick={() => { setGoalText(goalDraft.trim() || goalText); setEditingGoal(false); }}
                    style={{ fontSize: 11, color: '#fff', background: V.cyan, border: 'none', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontFamily: SAN, fontWeight: 600 }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => { setGoalDraft(goalText); setEditingGoal(true); setTimeout(() => goalRef.current?.focus(), 0); }}
                style={{ fontSize: 12, lineHeight: 1.6, color: V.textMid, margin: 0, cursor: 'text' }}
                title="Click to edit"
              >
                {goalText}
              </p>
            )}

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${V.border}`, display: 'flex', gap: 5 }}>
              {['TOPS/W', 'Thermal', 'Memory'].map(t => (
                <span key={t} style={{ fontFamily: JBM, fontSize: 9, color: V.cyan, background: V.cyanL, border: `1px solid #bae6fd`, borderRadius: 4, padding: '2px 6px' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Scout toggle */}
            <button
              onClick={() => !scoutExhausted && setScoutOn(v => !v)}
              disabled={scoutExhausted}
              className={scoutOn && !scoutExhausted ? 'dp-pulse' : ''}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderRadius: 8, padding: '10px 14px', cursor: scoutExhausted ? 'not-allowed' : 'pointer',
                background: scoutOn ? V.emeraldL : V.card,
                border: `1px solid ${scoutOn ? '#6ee7b7' : V.borderHi}`,
                color: V.emerald, textAlign: 'left', transition: 'all .18s',
                opacity: scoutExhausted ? 0.5 : 1,
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: SAN, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {scoutOn && !scoutExhausted && <span className="dp-spin" style={{ fontSize: 11 }}>⟳</span>}
                  {scoutExhausted ? 'Scout · fully scouted' : scoutOn ? 'Scout · scanning…' : 'Scout'}
                </span>
                <span style={{ fontFamily: JBM, fontSize: 9, opacity: .7, color: V.textMid }}>
                  {scoutExhausted ? 'All sources ingested' : scoutOn ? 'Releasing one source per tick' : 'Toggle to grow the graph'}
                </span>
              </span>
              <span style={{ position: 'relative', width: 28, height: 16, borderRadius: 8, flexShrink: 0, background: scoutOn && !scoutExhausted ? '#6ee7b7' : V.borderHi, transition: 'background .2s' }}>
                <span style={{ position: 'absolute', top: 2, left: scoutOn && !scoutExhausted ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
              </span>
            </button>

            {/* Analyze */}
            <button
              onClick={() => setModal(true)}
              disabled={analyzing}
              className={!analyzing ? 'dp-am' : ''}
              style={{
                borderRadius: 8, padding: '11px 14px', cursor: analyzing ? 'not-allowed' : 'pointer',
                background: analyzing ? V.card : 'linear-gradient(135deg,#92400e 0%,#b45309 100%)',
                border: `1px solid ${analyzing ? V.border : '#d97706'}`,
                color: analyzing ? V.textLo : '#fff', fontSize: 14, fontWeight: 700,
                letterSpacing: '0.04em', opacity: analyzing ? 0.5 : 1, transition: 'all .18s',
              }}
            >
              {analyzing ? '⟳ Analyzing…' : '▶ Analyze'}
            </button>

            <button disabled style={{ borderRadius: 8, padding: '10px 14px', cursor: 'not-allowed', background: V.card, border: `1px solid ${V.border}`, color: V.textLo, fontSize: 13 }}>
              Plan Next
            </button>
          </div>

          {/* Active jobs */}
          {running.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={secLabelStyle}>Active Jobs</div>
                <span style={{ fontFamily: JBM, fontSize: 9, color: V.cyan, background: V.cyanL, border: `1px solid #bae6fd`, borderRadius: 4, padding: '2px 7px' }}>{running.length} running</span>
              </div>
              {running.map(job => (
                <div key={job.id} style={{ ...cardStyle, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, borderColor: '#bae6fd', background: V.cyanL }}>
                  <span className="dp-blink" style={{ width: 7, height: 7, borderRadius: '50%', background: V.cyan, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ flex: 1, fontSize: 11, color: V.textHi, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.type === 'analyze' ? 'Daytona Analyze · Pareto' : `Scout · ${job.id.slice(-6)}`}
                  </span>
                  <span style={{ fontFamily: JBM, fontSize: 9, color: V.cyan }}>#{job.id.slice(-4)}</span>
                </div>
              ))}
            </div>
          )}

          {/* History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
            <div style={{ ...secLabelStyle, marginBottom: 2 }}>History</div>
            {jobs.length === 0 && <p style={{ fontSize: 12, color: V.textLo }}>No jobs yet. Click Scout to start.</p>}
            {jobs.map(job => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', ...cardStyle, borderRadius: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: job.status === 'running' ? V.cyan : job.status === 'done' ? V.emerald : '#ef4444' }} />
                <span style={{ flex: 1, fontSize: 11, color: V.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.type === 'analyze' ? 'Daytona Analyze · Pareto' : `Scout · ${job.id.slice(-8)}`}
                </span>
                <span style={{ fontFamily: JBM, fontSize: 9, flexShrink: 0, color: job.status === 'running' ? V.cyan : job.status === 'done' ? V.emerald : '#ef4444' }}>{job.status}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── GRAPH CANVAS (Cytoscape — draggable, force layout) ────────── */}
        <main style={{ position: 'relative', background: '#f0f6ff', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, background: 'rgba(255,255,255,.92)', border: `1px solid ${V.borderHi}`, borderRadius: 6, padding: '4px 10px', fontFamily: JBM, fontSize: 9, letterSpacing: '0.08em', color: V.cyan, backdropFilter: 'blur(6px)', textTransform: 'uppercase' }}>
            KG · {graph.nodes.length} nodes · {graph.edges.length} edges
          </div>
          <GraphCanvas
            graph={graph}
            selectedId={selectedNode?.id ?? null}
            onNodeClick={(n) => setSelectedNode(n)}
          />
        </main>

        {/* ── RIGHT ─────────────────────────────────────────────────────── */}
        <aside style={{ borderLeft: `1px solid ${V.border}`, background: V.panel, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>

          {/* Selected node */}
          {selectedNode && (
            <section style={{ padding: 16, borderBottom: `1px solid ${V.border}` }} className="dp-slide">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ ...secLabelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: NC[selectedNode.type], display: 'inline-block' }} />
                  Selected Node
                </span>
                <button onClick={() => setSelectedNode(null)} style={{ fontFamily: JBM, fontSize: 9, color: V.textLo, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em' }}>CLEAR</button>
              </div>
              <div style={{ ...cardStyle, padding: 12, borderLeft: `3px solid ${NC[selectedNode.type]}`, borderRadius: '0 8px 8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: NC[selectedNode.type], flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: V.textHi }}>{selectedNode.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                  <span style={{ fontFamily: JBM, fontSize: 9, color: NC[selectedNode.type], background: NC[selectedNode.type] + '18', border: `1px solid ${NC[selectedNode.type]}44`, borderRadius: 4, padding: '2px 7px' }}>{selectedNode.type}</span>
                  <span style={{ fontFamily: JBM, fontSize: 9, color: V.textLo }}>
                    {graph.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} connections
                  </span>
                </div>
                {selectedNode.props && Object.keys(selectedNode.props).length > 0 && (
                  <dl style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${V.border}`, paddingTop: 8 }}>
                    {Object.entries(selectedNode.props).filter(([, v]) => v != null && v !== '').slice(0, 6).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8 }}>
                        <dt style={{ fontFamily: JBM, fontSize: 9, color: V.textLo, width: 80, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</dt>
                        <dd style={{ fontFamily: JBM, fontSize: 10, color: V.textMid, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${V.border}` }}>
                  <div style={{ ...secLabelStyle, marginBottom: 5 }}>Connections</div>
                  {graph.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).slice(0, 5).map((e, i) => {
                    const otherId = e.source === selectedNode.id ? e.target : e.source;
                    const other = graph.nodes.find(n => n.id === otherId);
                    if (!other) return null;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <span style={{ fontFamily: JBM, fontSize: 9, color: V.textLo }}>{e.source === selectedNode.id ? '→' : '←'}</span>
                        <span style={{ fontFamily: JBM, fontSize: 9, color: V.cyan, background: V.cyanL, borderRadius: 3, padding: '1px 5px' }}>{e.type}</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: NC[other.type], flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: V.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{other.label}</span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontFamily: JBM, fontSize: 9, color: V.textLo, marginTop: 6, marginBottom: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedNode.id}</p>
              </div>
            </section>
          )}

          {/* Analyze runs */}
          <section style={{ padding: 16, borderBottom: `1px solid ${V.border}` }}>
            <div style={{ ...secLabelStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: V.amber, display: 'inline-block' }} />
              Analyze Runs
            </div>
            {analyzeRuns.length === 0
              ? <p style={{ fontSize: 12, color: V.textLo }}>No runs yet. Click Analyze to create one.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {analyzeRuns.slice(0, 5).map(run => {
                    const active = run.id === selectedRunId;
                    return (
                      <button key={run.id} onClick={() => {
                        setSelectedRunId(run.id);
                        if (run.result_ref) service.getArtifact(run.result_ref).then(a => { if (a) setArtifacts(cur => ({ ...cur, [run.result_ref!]: a })); });
                      }} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        background: active ? V.cyanL : V.card,
                        border: `1px solid ${active ? '#7dd3fc' : V.borderHi}`,
                        transition: 'all .15s',
                      }}>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: active ? V.cyan : V.textMid }}>
                            Run #{analyzeRuns.indexOf(run) + 1}
                          </span>
                          <span style={{ fontFamily: JBM, fontSize: 9, color: V.textLo }}>
                            {new Date(run.created_at).toLocaleTimeString()}
                          </span>
                        </span>
                        <span style={{ fontFamily: JBM, fontSize: 9, padding: '2px 8px', borderRadius: 4, background: run.status === 'running' ? V.cyanL : V.emeraldL, color: run.status === 'running' ? V.cyan : V.emerald, border: `1px solid ${run.status === 'running' ? '#7dd3fc' : '#6ee7b7'}` }}>
                          {run.status === 'running' ? '● running' : run.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
          </section>

          {/* Artifact */}
          {artifact && (
            <section style={{ padding: 16, borderBottom: `1px solid ${V.border}` }} className="dp-slide">
              <div style={{ ...secLabelStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: V.cyan, display: 'inline-block' }} />
                Run Detail
              </div>
              <div style={{ ...cardStyle, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: V.textHi, marginBottom: 10 }}>{artifact.title}</div>
                {artifact.kind === 'table' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {artifact.columns.map(c => (
                            <th key={c} style={{ textAlign: 'left', padding: '0 8px 5px 0', fontFamily: JBM, fontSize: 9, color: V.textLo, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: `1px solid ${V.border}` }}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {artifact.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} style={{ padding: '5px 8px 5px 0', color: ci === 0 ? V.textMid : V.cyan, fontFamily: ci > 0 ? JBM : SAN, fontSize: ci > 0 ? 11 : 10, borderBottom: `1px solid ${V.border}`, fontWeight: ri === 0 ? 600 : 400 }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {artifact.kind === 'chart' && artifact.image_url && (
                  <img src={artifact.image_url} alt={artifact.title} style={{ width: '100%', borderRadius: 6 }} />
                )}
                {artifact.takeaway && (
                  <p style={{ fontFamily: SAN, fontSize: 10, color: V.emerald, marginTop: 10, marginBottom: 0, fontStyle: 'italic', paddingTop: 8, borderTop: `1px solid ${V.border}` }}>{artifact.takeaway}</p>
                )}
              </div>

              {sparkPts.length >= 2 && (
                <div style={{ ...cardStyle, marginTop: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={secLabelStyle}>TOPS/W Trend</span>
                    <span style={{ fontFamily: JBM, fontSize: 9, color: V.emerald }}>{sparkPts[sparkPts.length - 1].toFixed(1)}</span>
                  </div>
                  <Sparkline pts={sparkPts} />
                </div>
              )}
            </section>
          )}

          {/* Findings feed */}
          <section style={{ padding: 16 }}>
            <div style={{ ...secLabelStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: V.emerald, display: 'inline-block' }} />
              Findings Feed
            </div>
            {findings.length === 0
              ? <p style={{ fontSize: 12, color: V.textLo }}>No findings yet.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {findings.slice(0, 12).map((f, i) => {
                    const bc = [V.cyan, V.emerald, V.amber][i % 3];
                    return (
                      <div key={f.id} className="dp-slide" style={{ background: V.card, border: `1px solid ${V.border}`, borderLeft: `3px solid ${bc}`, borderRadius: '0 8px 8px 0', padding: '9px 12px' }}>
                        <p style={{ fontSize: 11, lineHeight: 1.55, color: V.textMid, margin: '0 0 7px 0' }}>{f.text}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {f.value != null && (
                            <span style={{ fontFamily: JBM, fontSize: 9, color: V.amber, background: V.amberL, border: `1px solid #fcd34d`, borderRadius: 4, padding: '2px 7px' }}>
                              {f.value} {f.unit ?? ''}
                            </span>
                          )}
                          {f.technique && (
                            <span style={{ fontFamily: JBM, fontSize: 9, color: V.cyan, background: V.cyanL, border: `1px solid #7dd3fc`, borderRadius: 4, padding: '2px 7px' }}>{f.technique}</span>
                          )}
                          {f.source && (
                            <span style={{ fontFamily: JBM, fontSize: 9, color: '#7c3aed', background: '#ede9fe', border: `1px solid #c4b5fd`, borderRadius: 4, padding: '2px 7px' }}>{f.source}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </section>
        </aside>
      </div>

      {modal && <AnalyzeModal onClose={() => setModal(false)} onSubmit={runAnalyze} />}
    </div>
  );
}

function Div() {
  return <span style={{ width: 1, height: 12, background: '#e2e8f0', flexShrink: 0 }} />;
}
