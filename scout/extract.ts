import type { Measurement, ScoutExtraction, SourceMeta } from "./types.ts";

// Regex-first extraction (Decision Q1: regex now, optional Nebius LLM later behind the
// same ScoutExtraction shape). Pulls a technique name + TOPS/W + Memory(MB) from prose.

const TOPS_RE = /([\d.]+)\s*TOPS\/W/i;
const MEM_RE = /([\d.]+)\s*MB\b/i;
// Technique name = the sentence subject that precedes an achievement verb.
const TECHNIQUE_RE =
  /([A-Z][A-Za-z0-9,\- ]+?)\s+(?:achieves|delivers|reports|attains|reaches)\s+[\d.]+\s*TOPS\/W/;

function matchNum(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** First sentence containing `token` — used to keep the human-readable evidence. */
function sentenceWith(text: string, token: string): string {
  const sentences = text.split(/(?<=[.])\s+/);
  const hit = sentences.find((s) => s.includes(token));
  return (hit ?? text).trim();
}

function extractTechnique(src: SourceMeta): string {
  const m = src.text.match(TECHNIQUE_RE);
  return (m ? m[1] : src.title).trim();
}

/** Source text -> intermediate JSON. Pure and deterministic. */
export function extract(src: SourceMeta): ScoutExtraction {
  const technique = extractTechnique(src);
  const measurements: Measurement[] = [];

  const tops = matchNum(src.text, TOPS_RE);
  if (tops !== null) {
    measurements.push({
      technique,
      metric: "TOPS/W",
      value: tops,
      unit: "TOPS/W",
      direction: "improves", // higher TOPS/W is a gain
      raw_text: sentenceWith(src.text, "TOPS/W"),
    });
  }

  const mem = matchNum(src.text, MEM_RE);
  if (mem !== null) {
    measurements.push({
      technique,
      metric: "Memory_MB",
      value: mem,
      unit: "MB",
      direction: "hurts", // on-chip memory footprint counts against the memory constraint
      raw_text: sentenceWith(src.text, "MB"),
    });
  }

  return {
    source: { id: src.id, url: src.url, title: src.title, type: src.type },
    measurements,
  };
}
