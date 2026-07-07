import type { AnalyzeJobResult, SimulationResult } from "./types.js";

export type Artifact =
  | { kind: "chart"; title: string; image_url: string; takeaway?: string }
  | { kind: "table"; title: string; columns: string[]; rows: (string | number)[][]; takeaway?: string };

type DoneResult = Extract<SimulationResult, { status: "done" }>;

// Renders the real Daytona-computed Monte-Carlo means as an SVG scatter,
// same visual contract as trigger-analyze.ts's fallbackArtifact() so the
// pipeline swap is a drop-in. Frontier points get an error-bar cross from
// the simulated CI95 range — the one piece the deterministic fallback can't produce.
export function toArtifact(job: AnalyzeJobResult, jobType: "pareto" | "ranking"): Artifact {
  const done = job.results.filter((r): r is DoneResult => r.status === "done");

  if (jobType === "ranking") {
    const ranked = [...done].sort((a, b) => b.tops_w.mean - a.tops_w.mean);
    return {
      kind: "table",
      title: "Technique Ranking — TOPS/W (Daytona Monte-Carlo)",
      columns: ["Technique", "TOPS/W (mean)", "Memory (MB, mean)"],
      rows: ranked.map((r) => [r.technique, Number(r.tops_w.mean.toFixed(2)), Number(r.memory_mb.mean.toFixed(2))]),
      takeaway: ranked.length ? `${ranked[0].technique} leads on simulated TOPS/W.` : undefined,
    };
  }

  return {
    kind: "chart",
    title: "Pareto Frontier — TOPS/W (↑) vs Memory (↓), Daytona Monte-Carlo",
    image_url: paretoSvg(done, job.pareto_frontier),
    takeaway: job.summary,
  };
}

function paretoSvg(done: DoneResult[], frontierIds: string[]): string {
  const W = 420,
    H = 300,
    pad = 44;
  const xs = done.map((p) => p.memory_mb.mean);
  const ys = done.map((p) => p.tops_w.mean);
  const xMin = Math.min(...xs, 0),
    xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0),
    yMax = Math.max(...ys, 1);
  const sx = (v: number) => pad + ((v - xMin) / (xMax - xMin || 1)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v - yMin) / (yMax - yMin || 1)) * (H - 2 * pad);
  const frontier = new Set(frontierIds);

  const dots = done
    .map((p) => {
      const on = frontier.has(p.technique_id);
      const cx = sx(p.memory_mb.mean),
        cy = sy(p.tops_w.mean);
      const errBar = on
        ? `<line x1="${cx.toFixed(1)}" y1="${sy(p.tops_w.ci95_low).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${sy(p.tops_w.ci95_high).toFixed(1)}" stroke="#38bdf8" stroke-width="1" opacity="0.5"/>`
        : "";
      return (
        errBar +
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${on ? 6 : 4}" fill="${on ? "#38bdf8" : "#64748b"}"/>` +
        `<text x="${(cx + 8).toFixed(1)}" y="${(cy + 3).toFixed(1)}" fill="#cbd5e1" font-size="9">${p.technique}</text>`
      );
    })
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#0b0f17"/>` +
    `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#334155"/>` +
    `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="#334155"/>` +
    `<text x="${W / 2}" y="${H - 10}" fill="#94a3b8" font-size="10" text-anchor="middle">Memory (MB) →</text>` +
    `<text x="14" y="${H / 2}" fill="#94a3b8" font-size="10" text-anchor="middle" transform="rotate(-90 14 ${H / 2})">TOPS/W →</text>` +
    dots +
    `</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
