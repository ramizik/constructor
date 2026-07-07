import type { Artifact, Finding, GraphData } from '../types';

// All shapes follow the LOCKED Phase-0 contract (docs/PHASE0_DECISIONS.md,
// SCOUT_CONTRACT.md): id prefixes, two metrics (TOPS/W ↑, Memory_MB ↓),
// ADDRESSES edges, numeric Finding.value.

const RUN_ID = 'run_mock_0001';

// Seed graph: one ResearchGoal, the two metrics, one known technique — small
// but connected so the canvas is never empty and never a disconnected island.
export const seedGraph: GraphData = {
  nodes: [
    { id: 'goal_main', label: 'TOPS/W under thermal + memory limits', type: 'ResearchGoal' },
    { id: 'metric_tops-w', label: 'TOPS/W', type: 'Metric' },
    { id: 'metric_memory-mb', label: 'Memory_MB', type: 'Metric' },
    { id: 'tech_int4-quantization', label: 'INT4 Quantization', type: 'Technique' },
  ],
  edges: [{ id: 'seed_e1', source: 'tech_int4-quantization', target: 'goal_main', type: 'ADDRESSES' }],
};

// Techniques Scout extracts (technique → [tops_w, memory_mb]).
const TECHS: { id: string; name: string; src: string; srcName: string; tops: number; mem: number }[] = [
  { id: 'tech_int4-quantization', name: 'INT4 Quantization', src: 'src_tops-per-watt-survey', srcName: 'TOPS/W Survey', tops: 4.2, mem: 1.5 },
  { id: 'tech_mixed-precision-scheduling', name: 'Mixed-Precision Scheduling', src: 'src_tops-per-watt-survey', srcName: 'TOPS/W Survey', tops: 3.1, mem: 2.4 },
  { id: 'tech_structured-sparsity', name: 'Structured Sparsity', src: 'src_edge-accelerator-thermal-2025', srcName: 'Edge Accelerator Thermal 2025', tops: 2.6, mem: 0.9 },
  { id: 'tech_weight-streaming', name: 'Weight Streaming', src: 'src_memory-constrained-inference', srcName: 'Memory-Constrained Inference Notes', tops: 1.8, mem: 0.5 },
];

export const scoutFindingsGraph: GraphData = {
  nodes: [
    ...TECHS.map((t) => ({ id: t.id, label: t.name, type: 'Technique' as const })),
    ...[...new Set(TECHS.map((t) => t.src))].map((id) => {
      const t = TECHS.find((x) => x.src === id)!;
      return { id, label: t.srcName, type: 'Source' as const };
    }),
    ...TECHS.flatMap((t) => [
      { id: `find_${t.id}_tops`, label: `${t.tops} TOPS/W`, type: 'Finding' as const },
      { id: `find_${t.id}_mem`, label: `${t.mem} MB`, type: 'Finding' as const },
    ]),
  ],
  edges: [
    ...TECHS.map((t) => ({ id: `e_addr_${t.id}`, source: t.id, target: 'goal_main', type: 'ADDRESSES' as const })),
    ...TECHS.map((t) => ({ id: `e_imp_${t.id}`, source: t.id, target: 'metric_tops-w', type: 'IMPROVES' as const })),
    ...TECHS.map((t) => ({ id: `e_hurt_${t.id}`, source: t.id, target: 'metric_memory-mb', type: 'HURTS' as const })),
    ...TECHS.flatMap((t) => [
      { id: `e_f1_${t.id}`, source: `find_${t.id}_tops`, target: t.src, type: 'EXTRACTED_FROM' as const },
      { id: `e_f2_${t.id}`, source: `find_${t.id}_tops`, target: t.id, type: 'SUPPORTS' as const },
      { id: `e_f3_${t.id}`, source: `find_${t.id}_mem`, target: t.src, type: 'EXTRACTED_FROM' as const },
      { id: `e_f4_${t.id}`, source: `find_${t.id}_mem`, target: t.id, type: 'SUPPORTS' as const },
    ]),
  ],
};

export const scoutFindings: Finding[] = TECHS.flatMap((t) => [
  {
    id: `find_${t.id}_tops`,
    text: `${t.name} reports ${t.tops} TOPS/W`,
    value: t.tops,
    unit: 'TOPS/W',
    metric_name: 'TOPS/W',
    technique: t.name,
    source: t.srcName,
    run_id: RUN_ID,
    created_at: new Date().toISOString(),
  },
  {
    id: `find_${t.id}_mem`,
    text: `${t.name} needs ${t.mem} MB on-chip`,
    value: t.mem,
    unit: 'MB',
    metric_name: 'Memory_MB',
    technique: t.name,
    source: t.srcName,
    run_id: RUN_ID,
    created_at: new Date().toISOString(),
  },
]);

export const analyzeGraph: GraphData = {
  nodes: [
    { id: 'exp_mock_1', label: 'Pareto Analysis Run', type: 'ExperimentRun' },
    { id: 'artifact_mock_1', label: 'Pareto Frontier', type: 'ResultArtifact' },
  ],
  edges: [
    { id: 'e_prod', source: 'exp_mock_1', target: 'artifact_mock_1', type: 'PRODUCES' },
    ...TECHS.map((t) => ({ id: `e_test_${t.id}`, source: 'exp_mock_1', target: t.id, type: 'TESTS' as const })),
  ],
};

function paretoFrontier(pts: typeof TECHS) {
  return pts.filter(
    (p) => !pts.some((q) => q !== p && q.tops >= p.tops && q.mem <= p.mem && (q.tops > p.tops || q.mem < p.mem)),
  );
}

function paretoSvg(): string {
  const W = 420, H = 300, pad = 44;
  const frontier = new Set(paretoFrontier(TECHS));
  const xMax = Math.max(...TECHS.map((t) => t.mem)) * 1.1;
  const yMax = Math.max(...TECHS.map((t) => t.tops)) * 1.1;
  const sx = (v: number) => pad + (v / xMax) * (W - 2 * pad);
  const sy = (v: number) => H - pad - (v / yMax) * (H - 2 * pad);
  const dots = TECHS.map((t) => {
    const on = frontier.has(t);
    return (
      `<circle cx="${sx(t.mem).toFixed(1)}" cy="${sy(t.tops).toFixed(1)}" r="${on ? 6 : 4}" fill="${on ? '#38bdf8' : '#64748b'}"/>` +
      `<text x="${(sx(t.mem) + 8).toFixed(1)}" y="${(sy(t.tops) + 3).toFixed(1)}" fill="#cbd5e1" font-size="9">${t.name}</text>`
    );
  }).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#0b0f17"/>` +
    `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#334155"/>` +
    `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="#334155"/>` +
    `<text x="${W / 2}" y="${H - 10}" fill="#94a3b8" font-size="10" text-anchor="middle">Memory (MB) →</text>` +
    `<text x="14" y="${H / 2}" fill="#94a3b8" font-size="10" text-anchor="middle" transform="rotate(-90 14 ${H / 2})">TOPS/W →</text>` +
    dots +
    `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const analyzeArtifact: Artifact = {
  kind: 'chart',
  title: 'Pareto Frontier — TOPS/W (↑) vs Memory (↓)',
  image_url: paretoSvg(),
  takeaway: `${paretoFrontier(TECHS).map((t) => t.name).join(', ')} dominate the efficiency/memory tradeoff.`,
};
