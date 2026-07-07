# Demo Script

Target run length: 3-4 min. Live at `https://constructor-hackathon.butterbase.dev`.
Status tags: ✅ built + verified live · ⚠️ built but degraded/fallback · ⬜ not built.

---

## Script — what to click, what happens on screen, what runs in backend

### 1. Open dashboard ✅
**Click:** nothing, just load the page.
**See:** seeded graph (16 nodes: goal, 3 techniques, 2 metrics, sources, findings, 1 seed `ExperimentRun`/`ResultArtifact`). Goal text top-left: *"Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators."*
**Backend:** `App.tsx` fires `get-graph`, `get-findings`, `get-run-history`, `get-jobs` on mount (`App.tsx:52-64`). Pure reads, no jobs kicked off.

### 2. Toggle Scout ON ✅ (left panel button)
**Click:** Scout toggle.
**See:** graph grows one source at a time — new Source/Technique/Finding nodes fade in on canvas roughly every 20s. After 3 ticks (3 fixed sources exhausted) the toggle auto-flips OFF and greys out ("exhausted").
**Backend:** frontend `setInterval` (`App.tsx:97-119`, `SCOUT_TICK_MS = 20_000`) calls `trigger-scout({mode:'auto'})` on each tick. Function (`trigger-scout.ts:41-65`) picks the next un-ingested fixture via `pickNextAutoSource`, writes one Source + its Techniques/Metrics/Findings to Neo4j with a single `MERGE` Cypher (`trigger-scout.ts:107-144`), returns `done:true` once all 3 fixtures are in. This is a real Neo4j write each tick, not a mock — just against 3 fixed pre-picked sources (`FIXTURES`, `trigger-scout.ts:176-206`), not live web crawling, by design (CLAUDE.md: fixed inputs over flaky live fetch).

### 3. Click Analyze → modal (job type: Pareto, optional note) → confirm ✅/⚠️
**Click:** Analyze → pick "Pareto" → Confirm.
**See:** modal closes, left panel shows job as running (`analyzing` flag, `App.tsx:122-127`) until it flips to done, then right panel auto-switches to the new run and renders its artifact (chart or table + one-line takeaway).
**Backend — this is the part to narrate carefully:**
- `trigger-analyze.ts:24-37` inserts a `jobs` row, returns `job_id` immediately, and runs the rest in `ctx.waitUntil` (fire-and-forget from the HTTP response).
- `runAnalyze` (`trigger-analyze.ts:39-95`) queries Neo4j for every `Technique`'s TOPS/W + Memory_MB pair, builds the `ParetoPoint[]` payload.
- `runRocketRidePipeline` (`trigger-analyze.ts:101-115`): **if `env.ROCKETRIDE_PIPELINE_URL` is set and reachable**, POSTs `{jobType, data}` to it. RocketRide's Cloud pipeline runs Scout again and calls the tunneled Daytona job server (`backend/src/daytona/server.ts`), which calls `runAnalyzeJob` (`batch.ts:35`) → `runTechniqueSimulation` per technique (`simulate.ts:26-49`) → **this is the only point actual Daytona sandboxes spin up** (`daytona.create({language:'python'})`, one per technique, run Monte-Carlo script, `daytona.delete()` when done). Real sandbox runs are visible in the Daytona dashboard only during this window.
- **If the pipeline URL is unset or the fetch fails**, falls straight through to `fallbackArtifact()` (`trigger-analyze.ts:118-138`) — a deterministic local Pareto-frontier SVG or ranked table, no sandbox involved.
- Either way, the result gets written back to Neo4j as real `ExperimentRun`/`ResultArtifact` nodes (`trigger-analyze.ts:72-89`) and the job row flips to `done` with `result_ref`.

**Before the demo, verify which path fires**: check `manage_function get trigger-analyze` for `ROCKETRIDE_PIPELINE_URL` in `envKeys`, and confirm the Daytona server + tunnel are actually running. If not, say plainly: "artifact is a real graph write-back, chart today is a deterministic fallback, not a sandboxed run" — per CLAUDE.md, never imply a mocked piece is more than it is.

### 4. Right panel: click between runs ✅
**Click:** a past run in the run list.
**See:** artifact for that run loads (`onSelectRun`, `App.tsx:136-143`), history/trend view context comes from `get-run-history` (`RunHistoryPoint[]`: run_id, created_at, best_technique, best_tops_w — one point per run, max TOPS/W in that run).
**Backend:** `get-run-history` function (deployed, `backend/butterbase/bundled/get-run-history.deploy.ts`) reads `(run:ExperimentRun)-[:TESTS]->(t)-[:IMPROVES|HURTS]->(Metric{name:'TOPS/W'})` per run, no live computation — pure Cypher read.

### 5. Click a graph node ✅
**Click:** any node in the canvas.
**See:** right panel swaps to node detail view; "clear selection" returns to run view.
**Backend:** no fetch — uses the already-loaded `graph` state client-side.

### 6. Plan Next ⬜ not built, stretch-only
Button doesn't exist / disabled if present. Skip entirely.

### 7. Close
One-line takeaway from the artifact's `takeaway` field (e.g. *"Near-Memory Compute leads on TOPS/W but costs memory"*). Name **RocketRide** explicitly as the orchestrator (organizer-mandated must-have) regardless of which path fired in step 3.

---

## What's real right now (verified live)
- Butterbase app `app_c6q2usx31f76`, frontend at `constructor-hackathon.butterbase.dev`
- Neo4j Aura live, reachable from deployed Functions over HTTP Query API v2
- `get-graph`, `get-findings`, `get-jobs`, `get-artifact`, `get-run-history` — real reads
- `trigger-scout` auto mode — real incremental Neo4j writes, one fixture per tick, ~20s cadence
- `trigger-analyze` — real Neo4j write-back (`ExperimentRun`/`ResultArtifact`) regardless of pipeline path
- Daytona SDK connection + Pareto job script (`batch.ts`, `simulate.ts`) — verified standalone (`npm run analyze:test`)
- Standalone Daytona HTTP job server (`backend/src/daytona/server.ts`, `npm run daytona:serve`, `POST /run`) — built, needs to be running + tunneled for RocketRide to reach it

## What's mocked/fallback if RocketRide path isn't live at demo time
- Analyze artifact = local deterministic SVG/table generator (`fallbackArtifact`), not a real Daytona sandbox run
- This only happens if `ROCKETRIDE_PIPELINE_URL` is unset on the deployed function, or the pipeline/tunnel is unreachable — **check this before the demo**, don't assume

## What's not built
- Planner agent / "Plan Next" button

## If time runs out before rehearsal
Demo the fallback path as-is and say so out loud: "Scout ingests incrementally, real Neo4j writes each tick; Analyze always writes a real graph result, chart is deterministic today while the RocketRide→Daytona live path finishes verification." Per CLAUDE.md: never claim a mocked/fallback piece is more than it is.
