// Shared normalization/id rules from docs/PHASE0_DECISIONS.md Q4/Q5.
// Scout (Logan) must import and reuse these exact functions — a
// re-implementation that diverges even slightly will fork nodes instead
// of MERGE-ing onto the seed graph.

const PREFIXES = {
  goal: "goal_",
  source: "src_",
  technique: "tech_",
  metric: "metric_",
  finding: "find_",
  scoutRun: "run_",
  experimentRun: "exp_",
  resultArtifact: "artifact_",
} as const

export type IdKind = keyof typeof PREFIXES

// Q4: lower -> trim -> collapse whitespace -> strip trailing punctuation
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
}

// Q5: normalize, then replace non-[a-z0-9] runs with a single '-', trim dashes
export function slugify(raw: string): string {
  return normalizeName(raw)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function makeId(kind: IdKind, naturalKey: string): string {
  return PREFIXES[kind] + slugify(naturalKey)
}
