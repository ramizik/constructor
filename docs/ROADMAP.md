# Roadmap

Read [PROJECT_IDEA.md](./PROJECT_IDEA.md) first. This file is the execution order — who builds what, in what sequence, against what interface, so nobody blocks anybody.

**Core loop we're shipping:** Scout writes nodes to Neo4j → Analyst reads Neo4j, calls a **RocketRide Cloud pipeline** (organizer-mandated must-have, new as of this update) which orchestrates/starts/monitors the Daytona job → results written back to Neo4j → frontend shows all of it live. Planner is a stretch goal only.

## Status snapshot (updated 2026-07-07, ~1:55 in)

- ✅ Phase 0 — all 4 contracts locked, schema pushed.
- ✅ Phase 1 — frontend (3 panels, modals, mock + Butterbase service toggle), Butterbase functions (`trigger-scout`, `trigger-analyze`, `get-graph`, `get-findings`, `get-jobs`, `get-artifact`), Scout writer, Neo4j client/seed/schema, Daytona SDK scaffold all built.
- ✅ **App deployed live** via Butterbase MCP: `app_c6q2usx31f76` (`https://api.butterbase.ai/v1/app_c6q2usx31f76`). `jobs` table applied + realtime enabled, all 6 functions deployed and **test-invoked for real**: Scout run added 16 nodes (16→32), Analyze read them, wrote `ExperimentRun`/`ResultArtifact` back, `get-artifact` returned the chart. `frontend/.env.local` points at this app (`VITE_USE_BUTTERBASE=true`).
- ⚠️ **Phase 1.5 checkpoint — loop works, gaps remain.** See risk below.
- ⬜ **New scope, not started:** Scout toggle (`{mode:'auto'}` + client interval), Analyze run history + trend view (`get-run-history`, `RightPanel` rework). See Phase 0 contracts 2 and 2b.
- ⬜ Phase 2/3/4 — not started.

### Deployment note: MCP path differs from `deploy.sh`/CLI path
The functions in `backend/butterbase/functions/*.ts` (`_lib.ts` + REST-based `bbInsert`/`bbUpdate`/`bbGet`) are the CLI-deploy source Rohan wrote — untouched. What's actually live right now was deployed a different way: through the Butterbase MCP tool (`deploy_function`), which takes one self-contained file per function (no cross-file imports) and gives each function `ctx.db` (direct Postgres) instead of BB-REST. Bundled, MCP-deployable copies live in `backend/butterbase/bundled/` (`_shared.ts.inc` + per-function `*.ts`, concatenated into `*.deploy.ts`) — same contract/logic, jobs-table calls rewritten to use `ctx.db.query()`. If you redeploy via `deploy.sh`/CLI instead, the original `functions/*.ts` still works as designed; just don't run both paths against the same app without reconciling job-table access.

### RocketRide wiring — LOCKED architecture, pipeline built + deployed, one real blocker left
`trigger-analyze` no longer calls the dead `${DAYTONA_API_URL}/pareto` stub. Both the CLI-deploy source (`backend/butterbase/functions/trigger-analyze.ts`, `_lib.ts`) and the live MCP-deployed copy (`bundled/trigger-analyze.ts` — redeployed and reverified) now call `env.ROCKETRIDE_PIPELINE_URL` instead, with the same deterministic fallback if it's unset. Confirmed live: reran Analyze after the redeploy, still `done`, still fallback artifact (URL empty), no regression.

**Update 2026-07-07 (later):** the pipeline itself is now built — `constructor-pipeline.pipe` at repo root (webhook → question → `agent_rocketride` with LLM/memory/`tool_http_request` → response; LLM is MiniMax M3, not Anthropic). All required credentials filled in `.env`.

**Update 2026-07-07 (even later): actually deployed to RocketRide Cloud, confirmed persistent.** Turns out the VS Code sidebar's Run/Stop is *not* deployment — it's an interactive, session-tied execution. Real deployment goes through the TS SDK's `client.deploy` namespace (`add`/`list`/`status`/`remove`/`update`), undocumented in the locally-bundled docs, found on `docs.rocketride.org`. Deployed via a new small script, `rocketride-deploy/deploy.mjs` (`npm install && node deploy.mjs`) — calls `client.deploy.add(pipeline, {schedule:'manual'})`, returned `state:"active"`. Verified it stays reachable after the deploying script's own connection fully closed (`curl`'d the webhook URL again afterward, still `200`).

**But there's a real, confirmed blocker before `ROCKETRIDE_PIPELINE_URL` can be set:** the webhook trigger is async-only — `POST /webhook?auth=...` returns an ingestion ack (`objectId`) immediately, not the pipeline's result. Getting the actual `Artifact` back requires a WebSocket subscription (SDK session or the observability DAP socket) — there's no plain REST polling endpoint. `trigger-analyze.ts`'s current `fetch()` + `res.json() as Artifact` cannot work against this as-is. Proposed fix (not yet built, needs Rohan/Ramis sign-off since it changes the locked call graph): flip `trigger-analyze` to fire-and-forget like the rest of the app's job pattern, add a small `rocketride-callback` Function that receives the artifact and finishes the job, have the pipeline's agent POST to it as a 4th step. Full detail in `docs/ROCKETRIDE_REQUIREMENTS.md` §9 item 1 — read that before touching `trigger-analyze.ts` or the pipeline further. Also note §9 item 2: `constructor-pipeline.pipe`'s `project_id` keeps randomly rewriting itself on save (extension sync side-effect) — each churn during a redeploy risks leaving an orphaned `active` deployment on the account, worth periodically checking `client.deploy.list()`.

**This is the final call graph — do not restructure it without Ramis + Rohan sign-off:**
1. Frontend Analyze click → `trigger-analyze` (Butterbase Function).
2. `trigger-analyze` reads current Neo4j graph state (Technique IMPROVES|HURTS edges) → builds `ParetoPoint[]`.
3. `trigger-analyze` POSTs `{ jobType, data: points }` to `env.ROCKETRIDE_PIPELINE_URL` — the deployed RocketRide Cloud pipeline.
4. The RocketRide pipeline (built visually, deployed to RocketRide Cloud, not part of this repo) is responsible for starting Scout (calls the `trigger-scout` Function endpoint to (re)populate the graph if the pipeline is configured to do so) and for driving the real analysis: it calls the standalone **Daytona job HTTP server** — `backend/src/daytona/server.ts`, run via `npm run daytona:serve`, exposes `POST /run` wrapping the real `@daytona/sdk` batch job (`batch.ts`). This has to be a separate process (not a Butterbase Function) because `@daytona/sdk` needs Node core modules the Deno-edge Function runtime doesn't have — confirmed via an esbuild smoke test. Server needs to be tunneled to a public URL RocketRide can reach.
5. RocketRide returns `Artifact` JSON (chart or table) back to `trigger-analyze`.
6. `trigger-analyze` writes `ExperimentRun`/`ResultArtifact` to Neo4j, marks the job `done`.
7. If `ROCKETRIDE_PIPELINE_URL` is unset or the pipeline is unreachable, `trigger-analyze` falls through to a deterministic local SVG/table fallback — demo never hard-fails, but say plainly it's not sandboxed if this path is active.

**To go live once someone builds and deploys the RocketRide pipeline:**
- MCP-deployed app (`app_c6q2usx31f76`): `manage_function` action `update_env` on `trigger-analyze`, `{ ROCKETRIDE_PIPELINE_URL: "<endpoint>" }` — no code change, no redeploy.
- CLI-deploy path (`deploy.sh`): set `ROCKETRIDE_PIPELINE_URL` in `backend/.env` before running it.
- Start the Daytona job server (`npm run daytona:serve` from `backend/`) and tunnel it to a public URL, then wire that URL into the RocketRide pipeline's Daytona-calling node.

Contract the pipeline must satisfy (matches `server.ts` exactly): `POST { jobType: 'pareto'|'ranking', data: ParetoPoint[] }` → returns `Artifact` JSON (`{kind:'chart', image_url, title, takeaway?}` or `{kind:'table', columns, rows, title, takeaway?}`). Owners: Ramis (Daytona job server, `backend/src/daytona/*`) + Rohan (pipeline build/deploy to RocketRide Cloud, `trigger-analyze` env wiring). Until the URL is set, say plainly in the demo that the chart is deterministic, not sandboxed.

---

## Phase 0 (0:00-0:20): Lock interfaces, not code — ✅ DONE

Nobody writes agent logic until these 3 contracts are written down and everyone's seen them. This is the only phase that's serial — everything after is parallel.

### 1. Neo4j schema (owner: Sid) — ✅ DONE
Nodes: `ResearchGoal`, `Technique`, `Metric`, `Finding`, `Source`, `ExperimentRun`, `ResultArtifact`
Relationships: `SUPPORTS`, `EXTRACTED_FROM`, `TESTS`, `PRODUCES`, `IMPROVES`/`HURTS`

Cut `AgentTask` node from schema for now — only needed if Planner gets built.

Deliverable: a `schema.cypher` seed script that creates 5-10 starter nodes so the graph is never empty. Push this first, before anyone else needs to query against it.

`graph/schema.cypher` pushed and seeded — `neo4j:seed` run confirms 16 nodes live in Aura. Bolt connection verified via `backend/src/neo4j/test-connection.ts` (`npm run neo4j:test` from `backend/`). Deployed Butterbase Functions talk to the same instance over Aura's HTTP Query API v2 (`NEO4J_QUERY_URL`), not bolt — see `backend/.env.example` for the split.

### 2. Scout toggle + Analyze modal contract (owner: Rohan + Logan/Ramis agree together) — **UPDATED, was "Scout modal", now a toggle**
- **Scout is a toggle, not a modal-gated button.** ON → frontend starts a `setInterval` (demo cadence, ~20-30s) calling `trigger-scout` with `{ mode: 'auto' }`. OFF → frontend clears the interval. No backend scheduler/cron, no new server state — purely client-driven, safe because `trigger-scout` is idempotent (re-ticking after all sources are ingested is a no-op).
  - **`trigger-scout` needs new `auto` mode** (currently only supports an explicit `sources` list): query `MATCH (s:Source) RETURN s.id`, diff against the fixed `FIXTURES` keys, pick the first not-yet-ingested one, ingest just that one. If none remain, return `{ nodes: 0, edges: 0, done: true }` so the frontend can grey out the toggle or show "fully scouted." **Not built yet — flag before touching `trigger-scout.ts` / `bundled/trigger-scout.ts`, cross-cutting (Logan owns the function, Ramis+Rohan touched the bundled copy for RocketRide).**
- **Analyze modal** (unchanged shape, params now matter): job type (`pareto`/`ranking`, default pareto), optional note. Submit → `trigger-analyze` → **creates a new run, appended to history — never overwrites the previous run's card.**

Modal/toggle → Butterbase function call with params as JSON body → function kicks off the agent job async, returns a `job_id` → UI shows it running in the left panel task list. Don't block the UI thread on the job.

### 2b. Right-panel run history + trend contract (owner: Sid + Rohan agree together) — **NEW**
Right panel is no longer a single status card — it's a **navigable list of Analyze runs** (newest first, seed run included), backed by the existing `get-jobs` (job list) + `get-artifact` (per-run payload). Clicking a run loads its artifact + `takeaway`.

For the cross-run trend view (how the leading technique's TOPS/W changed over time): store the raw `ParetoPoint[]` used for that run on the `ResultArtifact` node too, not just the rendered SVG —
```cypher
MERGE (art:ResultArtifact {id: $artifactId})
  ON CREATE SET art.payload = $payload, art.points = $pointsJson, art.created_at = datetime()
```
— then a new lightweight Function (`get-run-history`) reads all `ExperimentRun -[:PRODUCES]-> ResultArtifact` ordered by `created_at`, parses each `art.points`, returns `{ run_id, created_at, best_technique, best_tops_w }[]`. Pure aggregation over already-fetched Neo4j data — **not a Daytona job**, don't push this into the sandbox. Frontend renders it as a small sparkline under the selected run's artifact.

### 3. Scout → Neo4j write contract (owner: Logan + Sid agree together) — **LOCKED**
Full node/relationship shapes, merge keys, idempotency rule, and ID-prefix convention are written up in [SCOUT_CONTRACT.md](./SCOUT_CONTRACT.md) and locked in [PHASE0_DECISIONS.md](./PHASE0_DECISIONS.md). Scout runs as a Butterbase Function (TS), writes Neo4j directly (no Daytona in this path).

### 4. Analyst ↔ Daytona job contract (owner: Ramis + Rohan agree together) — **LOCKED, job type decided**
Per [PHASE0_DECISIONS.md](./PHASE0_DECISIONS.md) Q3: job is a **Pareto scatter** on two axes — `TOPS/W` (maximize) vs `Memory_MB` (minimize) — with the Pareto frontier highlighted. Ranking-table-on-`TOPS/W` is the built-in fallback if two-axis extraction isn't landing by the 2:00 checkpoint (zero Scout rework needed to degrade).
- Input payload shape (per technique): `{"technique_id","technique","tops_w","memory_mb","higher_is_better":{"tops_w":true,"memory_mb":false}}` — see SCOUT_CONTRACT.md §3/§6.
- Output: chart artifact + `ExperimentRun`/`ResultArtifact` nodes written back to Neo4j (exact fields TBD by Ramis in Phase 1 — not blocking).
- **Daytona SDK connection confirmed working**: `backend/src/daytona/` scaffolded — `client.ts` (env-based init) + `test-connection.ts` (spins a real sandbox, runs code, tears down). Verified live. Ramis builds the actual Pareto job script on top of this.
- ✅ Pareto job script built (`batch.ts` + `run-analyze-job.ts`), both frontier and ranking-table paths implemented, tested standalone via `npm run analyze:test` (mock techniques → real Daytona sandbox run). ⚠️ Not yet wired into the deployed `trigger-analyze.ts` Function.

### 5. RocketRide orchestrator contract (owner: Ramis + Rohan agree together) — **LOCKED, organizer-mandated, must-have**
RocketRide sits between Scout and Analyst: `trigger-analyze` calls a RocketRide Cloud pipeline instead of calling Daytona directly. The pipeline is responsible for starting Scout and for driving the Daytona job to completion, then handing the artifact back. See "RocketRide wiring" note above for the exact call graph — that's the locked design, don't restructure it. Build the pipeline visually, then deploy it to RocketRide Cloud (cloud.rocketride.ai) — a local/Docker-only pipeline does not satisfy the requirement, it must be a live managed endpoint the app calls. Nebius LLM integration plan is dropped; any LLM step (extraction, ranking-explanation, planner) now runs inside the RocketRide pipeline if/when needed, not via a separate provider.

Once these are written in this file or a shared doc, Phase 0 is done. Don't gold-plate the schema — add fields only when a later step needs them.

---

## Phase 1 (0:20-2:00): Parallel build against locked interfaces

Each track builds independently. Nobody touches another track's files — if you need a cross-cutting change (e.g. schema needs a new field), flag it in the team channel, don't silently edit.

- **Sid (Graph + viz)** — ✅ Cytoscape.js frontend panel built (`GraphCanvas.tsx`), 3-panel layout shipped (`LeftPanel`, `RightPanel`, `Modal`), reads via `get-graph` function. ⬜ New: convert `RightPanel` from single status card to a navigable run-history list (Phase 0 contract 2b) — not built yet.
- **Rohan (Butterbase backbone)** — ✅ scaffolded on Butterbase.
  - **Functions** — ✅ shipped: `trigger-scout`, `trigger-analyze`, `get-graph`, `get-findings`, `get-jobs`, `get-artifact` (`backend/butterbase/functions/`). Async job kickoff via `ctx.waitUntil`, no blocking on Scout/Daytona. ⬜ New: `get-run-history` Function (contract 2b) not built yet.
  - **Postgres** — ✅ `jobs` table in `backend/butterbase/schema.sql` (`id`, `type`, `status`, `params`, `result_ref`, `message`, `created_at`).
  - **Realtime** — not yet confirmed wired to frontend; check before Phase 1.5 checkpoint (left-panel task list / status card should subscribe, not poll).
  - Durable Objects — not needed, table+realtime plan holds.
- **Logan (Scout)** — ✅ `trigger-scout.ts` Function built: deterministic fixture-based extraction (no live crawling), writes Source/Technique/Metric/Finding nodes to Neo4j per the locked contract. Standalone `scout/` package from earlier was merged into the Butterbase function and removed. ⬜ New: `{ mode: 'auto' }` support for the Scout toggle (contract 2) — not built yet.
- **Ramis (Analyst)** — ✅ repo split (`backend/`, `frontend/`) done. Daytona SDK scaffold verified live. Pareto job script (`batch.ts`/`run-analyze-job.ts`) built and tested standalone. ⚠️ Neo4j read → Daytona trigger → Neo4j write-back loop exists in `trigger-analyze.ts`, but the Daytona call itself is a stub HTTP fetch to a non-existent endpoint — real SDK job isn't reachable from the deployed function yet. See risk note at top.
- **Ramis + Rohan (RocketRide)** — ⚠️ pipeline built and **deployed live** to RocketRide Cloud (`state:"active"`, confirmed persistent), but `trigger-analyze` **cannot be repointed yet** — the webhook trigger is async-only (returns an ack, not the artifact) and `trigger-analyze.ts` expects a synchronous result. See `docs/ROCKETRIDE_REQUIREMENTS.md` §9 item 1 for the confirmed root cause and proposed fix (needs sign-off, changes the locked call graph).

### Frontend: 3 panels, ship this shape from the start
- **Left**: static goal text + **Scout toggle** (on/off) + **Analyze button** (opens config modal) + Plan Next (disabled until Planner exists) + task/status list
- **Center**: Cytoscape graph, animates new nodes as Scout ticks land and Analyze writes back
- **Right**: **run history — navigable list of Analyze runs**, newest first. Click a run to load its artifact (chart/table), takeaway, and a trend sparkline across prior runs (contract 2b). Findings feed stays as a secondary feed below it.

**Toggle/button behavior**: Scout toggle ON starts a client-side `setInterval` calling `trigger-scout({mode:'auto'})` — no modal, no per-tick user input. Analyze still opens a config modal (job type, note) before firing, and every submit creates a **new** run appended to history, never overwriting the last one. Job list/run history should update live via Butterbase realtime, not polling.

No auth, no multi-user, no session state. One page, one goal, hardcoded.

---

## Phase 1.5 (2:00-2:20): First integration checkpoint — do this early, don't wait until it's too late

Stop feature work. Answer these with a real click, not a code read:
1. Does toggling **Scout ON** write real nodes to Neo4j one source at a time, visible in the graph? — **NOT BUILT.** `trigger-scout` only supports the old explicit-`sources` call; `{mode:'auto'}` + the toggle UI don't exist yet.
2. Does clicking **Analyze** (via the config modal) trigger a real Daytona job (via RocketRide) and write a real artifact back to Neo4j, visible in the UI? — **NO.** Graph write-back works, but the artifact comes from `fallbackArtifact()`, not a real Daytona sandbox run. Fix before claiming this checkpoint is passed.
3. Is the RocketRide pipeline actually deployed to RocketRide Cloud (not just running locally)? — **YES, confirmed live and persistent** (`client.deploy.add()` via `rocketride-deploy/deploy.mjs`, `state:"active"`, reachable after the deploying session disconnected). This organizer must-have is satisfied. **But it's not actually usable by `trigger-analyze` yet** — the webhook trigger only returns an async ack, not the artifact, so wiring `ROCKETRIDE_PIPELINE_URL` in right now would break every Analyze run instead of fixing it. See `docs/ROCKETRIDE_REQUIREMENTS.md` §9 item 1.
4. Does the right panel show a navigable run history (not just the last run), and does clicking an old run reload its artifact? — **NOT BUILT.** `get-run-history` Function and the `RightPanel` rework are both pending.

If either is broken, everyone drops what they're doing and fixes the loop before adding anything else. This checkpoint is the whole point of the roadmap — miss it and the demo is at risk.

---

## Phase 2 (2:20-3:40): Integrate, fix, cut what's broken

- Build the RocketRide pipeline, deploy to RocketRide Cloud, repoint `trigger-analyze` at it — this is the priority fix in this phase, not optional cleanup.
- Wire any stubbed Butterbase routes to real Scout/Analyst calls.
- Fix whatever broke at the Phase 1.5 checkpoint.
- If Scout or Analyst is still flaky, simplify the extraction/job logic rather than debugging it further — a dumb version that works beats a smart version that doesn't demo.
- Only now: if both agents are solid and there's real time left, start Planner (single LLM call over graph contents, run inside the RocketRide pipeline — inspects graph, suggests weakest-evidence area as one `AgentTask`-style output). Whoever finishes their track first picks this up. If it's not solid by 3:40, cut it — leave the button greyed out.

---

## Phase 3 (3:40-4:20): Demo script rehearsal, freeze features

No new code. Rehearse the exact sequence:
1. Open dashboard, seeded graph visible, goal shown, run history shows the seed run
2. Toggle Scout ON → sources land one at a time over ~20-60s, graph animates, findings feed updates; toggle OFF once exhausted
3. Click Analyze → config modal → confirm → new run appears in history, job card shows running → artifact appears
4. Click between the seed run and the new run in history → frontier/ranking visibly changed
5. (Only if Planner shipped) Click Plan Next → gap suggestion appears
6. Close with the one-line takeaway the analysis produced

Say plainly in the demo what's mocked (fixed sources, single job type) — don't pretend it's more than it is.

---

## Phase 4 (4:20-5:00): Buffer + backup recording

Bug fixes only. Record a backup run of the full demo script in case live breaks.

---

## Non-negotiables (repeated from CLAUDE.md, because this is where people forget)
- Scout and Analyst are the two agents that must work end-to-end. Planner is stretch, cut without discussion if behind.
- No live web crawling, no PDF ingestion, no auth, no multi-user.
- One Daytona job type, not two.
- If a task threatens the 2:00 integration checkpoint, cut or stub it — don't push through.
