// Shared normalization/ID rules (Phase0 Decisions Q4, Q5). Track 1's seed script must
// apply the identical rules so seed and Scout MERGE onto the same nodes.

/** Q4: lower -> trim -> collapse whitespace -> strip trailing punctuation. */
export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "");
}

/** Q5: normalize, then replace non [a-z0-9] runs with '-', strip leading/trailing '-'. */
export function slug(raw: string): string {
  return normalizeKey(raw)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministic FNV-1a hash (hex) — sync, dependency-free, stable across Node/Deno. */
export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
