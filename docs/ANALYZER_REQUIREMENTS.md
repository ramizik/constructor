# Analyzer Requirements — Live Web Population (autonomous graph fill)

**Owner:** Logan (Scout track). **Sign-off needed from:** Ramis (RocketRide/Daytona — confirm no overlap), Sid (graph/viz — confirm new nodes render same as fixture nodes).
**Status:** DRAFT — build behind a flag, do not replace the fixture path.

---

## 0. What this is (read before touching code)

This is **not** a new agent and **not** the Daytona/RocketRide Analyze job. It's an extension of Scout's existing write path: instead of only reading from fixed local sources, Scout can optionally search the live web, extract findings with an LLM, and write to Neo4j through the **same idempotent writer already built and locked** in [SCOUT_CONTRACT.md](./SCOUT_CONTRACT.md). "Analyzer" here means: the agent that looks online, finds related info, and populates the graph autonomously (on click) — separate from the Pareto/RocketRide/Daytona pipeline, which is untouched by this doc.

**Do not confuse this with:**
- The Analyst agent / `trigger-analyze` / RocketRide pipeline — that's locked, see CLAUDE.md "LOCKED architecture" section. Nothing here changes it.
- A continuous/scheduled loop — this is still click-triggered only, per CLAUDE.md non-negotiables.

---

## 1. Scope

**In scope:**
- Live web search triggered by the existing Scout modal/button.
- LLM extraction of technique/metric/finding data from search results.
- Writing that data into Neo4j via the existing MERGE-based idempotent writer (no new Cypher, no new node/edge shapes).

**Out of scope / do not build:**
- Any change to `trigger-analyze.ts`, `backend/src/daytona/*`, or the RocketRide pipeline.
- A scheduled/autonomous timer loop — must stay click-triggered.
- New node or relationship types beyond what's in SCOUT_CONTRACT.md §1-2.
- PDF ingestion, multi-domain search, broad/unbounded crawling.

---

## 2. Architecture

```
Scout modal (live: true) → trigger-scout.ts
  1. fetch() → web search API (Tavily/Serper) — query = ResearchGoal.text + focus_hint
  2. LLM call → extracts SCOUT_CONTRACT §5 intermediate JSON shape from search results
  3. normalize (slug/stableHash, same rules as fixture path) → deterministic IDs
  4. same MERGE Cypher writer already built → Neo4j
  5. jobs row: pending → running → done/error, result_ref = counts + run_id
```

Steps 1-2 are new. Steps 3-5 are **existing code, reused as-is** — do not fork or duplicate the writer.

**Why this lives inside `trigger-scout.ts` and not a new service or RocketRide pipeline:** plain `fetch()` works fine in Butterbase's Deno-edge runtime (unlike `@daytona/sdk`, which needed the standalone `server.ts` workaround). No new infra needed. RocketRide's locked role is Scout→Analyze orchestration, not Scout's own extraction — keep infra simple per CLAUDE.md.

---

## 3. Gating (demo safety — this is the part that must not be skipped)

- New param on the Scout modal request: `live: boolean`, **default `false`**.
- `live: false` (default) → today's fixture path, unchanged. This is the safe path if the live path breaks mid-demo.
- `live: true` → search + LLM path, **hard timeout ~6-8s**. On timeout, empty results, or LLM output that fails the SCOUT_CONTRACT shape check → fall through to the fixture path, same fail-safe pattern as `fallbackArtifact()` in `trigger-analyze.ts`. Never let a live-search failure surface as a broken UI state.
- Demo script: rehearse both paths. If live search is flaky on the day, flip the default back to `false` and say plainly it's mocked, per CLAUDE.md.

---

## 4. LLM + search provider

- **Search:** Tavily or Serper — needs an API key someone grabs before Phase 2 ends. Not yet in `.env.example`; add `TAVILY_API_KEY` (or equivalent) when chosen, do not reuse or resurrect `NEBIUS_API_KEY` (dropped, see docs/ROADMAP.md).
- **LLM:** check Butterbase's built-in AI capability first (`manage_ai`) — if usable from a Function, zero new provider/key needed. Fallback: whatever LLM provider is already wired for RocketRide, reused here independently (this path does not go through RocketRide).

---

## 5. Extraction output contract (must match exactly — no new fields)

Same intermediate shape as SCOUT_CONTRACT.md §5:

```json
{
  "source": {"url": "...", "title": "...", "type": "paper"},
  "measurements": [
    {
      "technique": "...",
      "metric": "TOPS/W",
      "value": 4.2,
      "unit": "TOPS/W",
      "direction": "improves",
      "raw_text": "..."
    }
  ]
}
```

LLM prompt must constrain output to this shape (`metric` ∈ `{TOPS/W, Memory_MB}` — the two locked Pareto axes, nothing else). Reject/drop measurements that don't parse to a number — `Finding.value` is never a string, per SCOUT_CONTRACT §1.

---

## 6. Files touched (flag before editing anything outside this list)

- `backend/butterbase/functions/trigger-scout.ts` — add search+LLM branch behind `live` param.
- `backend/butterbase/bundled/trigger-scout.deploy.ts` — mirror the change (MCP-deployed copy, per ROADMAP.md's deployment-path note).
- `backend/.env.example` / `backend/.env` — add search API key placeholder.
- Frontend Scout modal — add `live` checkbox, default unchecked. Flag to Sid/Rohan before touching, it's not Logan's file.

**Do not touch:** `trigger-analyze.ts`, `backend/src/daytona/*`, RocketRide pipeline config, `graph/schema.cypher`, the Neo4j writer's Cypher itself (reuse, don't rewrite).

---

## 7. Verification before calling this done

1. `live: false` still produces identical output to today — no regression.
2. `live: true` with a real query returns findings that pass SCOUT_CONTRACT shape validation and write without duplicating nodes on a second click (idempotency check, same as fixture path).
3. Kill the search API key / simulate a timeout → confirm graceful fallback to fixtures, no broken UI, no unhandled error in `jobs` table.
4. Confirm new nodes render in Cytoscape identically to fixture-sourced nodes (same `run_id` animation behavior) — Sid sign-off.

---

## Open questions to close before building

1. **[Logan]** Tavily or Serper — pick one, get the key.
2. **[Logan + Rohan]** Confirm Butterbase `manage_ai` is callable from a Function context, or pick fallback LLM provider.
3. **[Logan]** Timeout value — 6-8s is a starting guess, tune against real search+LLM latency.
4. **[Sid]** Confirm live-sourced nodes need no special rendering treatment beyond existing `run_id` animation.
