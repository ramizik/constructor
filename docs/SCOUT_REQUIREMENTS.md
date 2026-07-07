# Scout Requirements — Toggle + Auto-Mode (build spec)

**Owner:** Logan. **Sign-off/cross-cutting:** Rohan (frontend toggle + `bundled/trigger-scout.ts` copy), Ramis (bundled copy also touched for RocketRide env typing — coordinate, don't collide).
**Status:** DRAFT — this is the gap between what's built today and what PROJECT_IDEA.md/ROADMAP.md now specify. Read [SCOUT_CONTRACT.md](./SCOUT_CONTRACT.md) first — the write contract (node/edge shapes, idempotency, ID prefixes) is already LOCKED and unchanged by this doc. This doc only covers the trigger/UX layer on top of it.

---

## 0. What changed and why

Original design: Scout = one button, one click, ingests all fixed sources at once. Current design (locked in PROJECT_IDEA.md/ROADMAP.md): **Scout = a toggle**, not a one-shot button. Reason: a single click that dumps 3 sources into the graph at once is a single jump on screen; a toggle that releases sources one at a time over the demo makes the graph visibly grow tick by tick — better live demo, same underlying data, zero extra backend infra.

**Not a new agent, not a scheduler.** Still the same closed, fixed 3-source pool (`FIXTURES` in `trigger-scout.ts`). Still click/toggle-triggered, not a real cron — per CLAUDE.md's "no autonomous continuous loop" cut, the polling is a **frontend-only `setInterval`**, not a backend job.

**Do not confuse this with [ANALYZER_REQUIREMENTS.md](./ANALYZER_REQUIREMENTS.md)** — that's a separate, unbuilt effort for live web search replacing the fixed `FIXTURES`. This doc is strictly about how the existing fixed-source extraction gets triggered (toggle + auto-pick-next vs. one-shot all-at-once). Both are additive to the same `trigger-scout.ts` — flag to Logan before touching either so they don't collide in the same file.

---

## 1. Current state (as built today)

`backend/butterbase/functions/trigger-scout.ts`:
- `POST` body: `{ sources?: string[], focus_hint?: string }`.
- If `sources` given, ingest only those keys; if omitted, ingest **all** `FIXTURES` keys at once (the old one-shot behavior).
- `FIXTURES` = 3 fixed entries: `arxiv:tops-per-watt-survey`, `arxiv:edge-accelerator-thermal-2025`, `internal:memory-constrained-inference` — each with 2-4 `measurements` (technique/metric/value/raw_text).
- Writes via the LOCKED MERGE contract (SCOUT_CONTRACT.md) — idempotent, safe to re-run.
- `jobs` row: `pending` → `running` → `done`/`error`, returns `{ job_id, run_id }`.

This is the **fallback / MVP path** — still correct, still safe. The toggle/auto-mode work below is additive on top, not a rewrite.

---

## 2. What to build

### 2.1 `trigger-scout.ts` — new `auto` mode
Add a third param mode:
```json
{ "mode": "auto" }
```
Behavior:
1. Query Neo4j for already-ingested sources: `MATCH (s:Source) RETURN s.id`.
2. Diff against `FIXTURES` keys (map `FIXTURES` key → `src_` id using the same `slug()`/`srcId()` helpers already imported in this file — don't invent a new ID scheme).
3. Pick the **first** not-yet-ingested key, ingest just that one (reuse the existing per-source ingestion loop, just scoped to one key instead of `selected`).
4. If none remain, return `{ nodes: 0, edges: 0, done: true }` — this is the signal the frontend uses to grey out / stop the toggle.

Keep `sources` param working exactly as today (explicit list, still supported — used by `focus_hint`-driven manual runs if ever needed). `auto` is additive, not a replacement.

### 2.2 Frontend — toggle instead of button+modal
- Scout button becomes a toggle (on/off), not a button that opens a modal.
- ON → `setInterval` (~20-30s cadence) calling `trigger-scout` with `{ mode: 'auto' }` each tick.
- OFF → clear the interval. No other state.
- When a tick response has `done: true`, stop the interval automatically and reflect "fully scouted" in the UI (e.g. grey out the toggle) — don't keep polling a source pool that's exhausted.
- No backend scheduler, no cron, no server-side timer — the interval lives entirely in the frontend. If the tab closes, ticking stops; that's fine, this is demo-only cadence, not a production ingestion pipeline (explicitly cut in PROJECT_IDEA.md).

**File:** frontend Scout control component (whatever currently renders the Scout button/modal) — flag to Sid/Rohan, this is frontend, not Logan's.

---

## 3. Why this is safe (idempotency carries the whole design)

The toggle/auto-mode design only works because the underlying writer is already MERGE-based and idempotent (SCOUT_CONTRACT.md §4): a tick that re-ingests an already-ingested source is a guaranteed no-op, not a duplicate-node bug. **Do not weaken or bypass this idempotency while building auto-mode** — the new `auto` logic's job is just to pick *which* source to send through the same existing write path, nothing about the write path itself changes.

---

## 4. Contract for the `auto` mode response

```json
{ "job_id": "job_scout_...", "run_id": "run_...", "nodes": 4, "edges": 6, "done": false }
```
or, when the pool is exhausted:
```json
{ "job_id": "job_scout_...", "run_id": "run_...", "nodes": 0, "edges": 0, "done": true }
```
`done` is the only new field the frontend needs to key off of. Everything else matches the existing job-status shape already in `get-jobs.ts`/the `jobs` table.

---

## 5. Files in scope / out of scope

**In scope:**
- `backend/butterbase/functions/trigger-scout.ts` — add `auto` mode branch. Logan.
- `backend/butterbase/bundled/trigger-scout.ts`, `bundled/trigger-scout.deploy.ts` — mirror the change (MCP-deployed copy, per ROADMAP.md's deployment-path note). **Coordinate with Ramis/Rohan** — this file was already touched for RocketRide env typing (`ROCKETRIDE_PIPELINE_URL` in `_shared.ts.inc`), don't clobber that.
- Frontend Scout toggle component — Sid/Rohan, flag before editing.

**Out of scope — do not touch for this:**
- `trigger-analyze.ts`, RocketRide pipeline, `backend/src/daytona/*` — unrelated, see [ROCKETRIDE_REQUIREMENTS.md](./ROCKETRIDE_REQUIREMENTS.md).
- `graph/schema.cypher`, the MERGE Cypher writer itself — reuse as-is, don't rewrite.
- Live web search / LLM extraction — separate unbuilt effort, see [ANALYZER_REQUIREMENTS.md](./ANALYZER_REQUIREMENTS.md). Don't merge that work into this one; land toggle/auto-mode first since it's the simpler, lower-risk piece.

---

## 6. Verification before calling this done

1. Toggle ON with empty graph → first tick ingests exactly one `FIXTURES` source, `done: false`.
2. Keep ticking → each tick ingests the next un-ingested source, no duplicates (check node count matches expected total, not double).
3. After all 3 sources ingested → next tick returns `done: true`, zero nodes/edges written, no error.
4. Toggle OFF mid-way → interval stops, no further calls; toggle back ON → resumes from wherever `auto` mode's Neo4j diff picks up (should just continue, not restart from source 1, since idempotency makes source 1 a no-op anyway).
5. Confirm graph viz still animates new nodes per tick using the returned `run_id`, same as the old one-shot click did.

---

## Open questions to close before building

1. **[Logan]** Tick cadence — PROJECT_IDEA.md says ~20-30s, confirm exact value against demo pacing (needs to visibly progress across the ~3-3.5 min demo without finishing too early or too late).
2. **[Logan + Rohan]** Does `auto` mode replace the explicit `sources` param entirely in the deployed function, or do both stay supported side by side? Recommend: keep both, `auto` is additive (per §2.1) — avoids breaking anything currently relying on explicit `sources`.
3. **[Sid/Rohan]** Toggle UI state while a tick's job is `running` — should the toggle show a subtle "ingesting..." indicator per tick, or just silently update the graph? Decide before demo rehearsal.
