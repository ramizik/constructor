# Roadmap

See [README.md](../README.md) for the pitch, architecture, and sponsor-tech breakdown. This file tracks what's actually implemented, what's live, and what's next.

**Core loop:** Scout writes nodes to Neo4j → Analyst reads Neo4j, calls a **RocketRide Cloud pipeline** which orchestrates/starts/monitors the Daytona job → results written back to Neo4j → frontend shows all of it live.

## Current status

Deployed live at `constructor-hackathon.butterbase.dev`. App: `app_c6q2usx31f76`.

### Working end-to-end
- **Neo4j graph** — schema + seed live in Aura (`graph/schema.cypher`). Nodes: `ResearchGoal`, `Technique`, `Metric`, `Finding`, `Source`, `ExperimentRun`, `ResultArtifact`. Relationships: `SUPPORTS`, `EXTRACTED_FROM`, `TESTS`, `PRODUCES`, `IMPROVES`/`HURTS`. Reads/writes go over Aura's HTTP Query API v2 (`NEO4J_QUERY_URL`), not bolt.
- **Frontend** — React + Vite + TS + Tailwind + Cytoscape.js. Three panels: left (goal, Scout toggle, Analyze button, task list), center (graph canvas, animates new/updated nodes), right (navigable run history with per-run artifact + trend sparkline).
- **Scout** — `trigger-scout` Butterbase Function, `{mode:'auto'}` support. Frontend toggle drives a client-side interval; each tick ingests the next un-ingested fixed source, writes `Source`/`Technique`/`Metric`/`Finding` nodes + `IMPROVES`/`HURTS` edges. Idempotent — auto-flips off once the fixed source pool is exhausted.
- **Analyze** — `trigger-analyze` Function reads all `Technique` TOPS/W + Memory_MB edges, builds a `ParetoPoint[]` payload, POSTs to the RocketRide pipeline. Each submit creates a new `ExperimentRun`/`ResultArtifact`, never overwrites the previous one.
- **RocketRide pipeline** — deployed and live on RocketRide Cloud (`constructor-pipeline.pipe`, deployed via `rocketride-deploy/deploy.mjs`, confirmed persistent). Fires Scout, drives the real Daytona job, returns an `Artifact`.
- **RocketRide relay** (`backend/src/rocketride/relay.ts`) — the pipeline's public webhook is async-only (returns an ack, not the result); the actual result only appears on the pipeline's `apaevt_flow` event stream. This relay is a small standalone Node process that holds the WebSocket session, fires `send()`, and resolves off the next `end` event — so `trigger-analyze`'s synchronous `fetch()` contract still works without changing the locked call graph. **Must be running (and `ROCKETRIDE_PIPELINE_URL` pointed at it) for Analyze to work at all — there is no fallback path anymore.**
- **Daytona execution** — `backend/src/daytona/server.ts` (`npm run daytona:serve`, `POST /run`) wraps the real `@daytona/sdk` batch job (`batch.ts`). Per technique: spins up an isolated Python sandbox, runs a Monte-Carlo simulation (500 samples, 5% relative std) over TOPS/W and Memory_MB, tears the sandbox down. Computes the Pareto frontier, builds a chart/table `Artifact`. Runs as a separate process (not a Butterbase Function) because `@daytona/sdk` needs Node core modules the Deno-edge Function runtime doesn't have.
- **Run history** — `get-run-history` Function aggregates `ExperimentRun -[:PRODUCES]-> ResultArtifact` (stored with raw `points` JSON, not just rendered SVG) into a `{run_id, created_at, best_technique, best_tops_w}[]` trend series. Right panel renders it as a sparkline under the selected run.
- **Butterbase Functions** (all deployed): `trigger-scout`, `trigger-analyze`, `get-graph`, `get-findings`, `get-jobs`, `get-artifact`, `get-run-history`. Job state (`jobs` table in `backend/butterbase/schema.sql`) drives async kickoff (`ctx.waitUntil`) so the UI never blocks on Scout/Daytona.

### Deployment path note
Two separate deploy mechanisms exist and are not interchangeable against the same job-table access pattern:
- `backend/butterbase/functions/*.ts` (+ `_lib.ts`, REST-based `bbInsert`/`bbUpdate`/`bbGet`) — CLI-deploy source (`backend/butterbase/deploy.sh`).
- `backend/butterbase/bundled/*.deploy.ts` — MCP-deployable, self-contained (one file per function, no cross-file imports), uses `ctx.db.query()` (direct Postgres) instead of BB-REST. **This is what's live right now.**

Same contract/logic in both; don't run both paths against the same app without reconciling job-table access. See the deploy trap note in [CLAUDE.md](../CLAUDE.md) — every redeploy wipes env vars, re-set them immediately after.

### Known gaps / recently fixed
- Graph canvas animation on Analyze completion was previously not firing reliably — addressed in `feat(frontend): make Analyze runs visually obvious on the graph` (commit `7f44c58`). Re-verify on next UI pass.
- `invoke()` endpoint path bug (`/fn/` vs wrong path) was blocking all live UI calls — fixed in `1694d49`. Re-verify if any new function call paths are added.
- **All fallback/mock code paths were removed** (post-hackathon cleanup): `trigger-analyze`'s deterministic in-function Pareto fallback, `get-artifact`'s dead legacy-shape reconstruction, `get-graph`/`get-findings`' silent catch-and-return-empty, and the frontend's in-memory `MockService` are all gone. Every one of these now fails loudly (thrown error / non-2xx response) instead of degrading silently. This means:
  - RocketRide relay (`backend/src/rocketride/relay.ts`) **must** be running and `ROCKETRIDE_PIPELINE_URL` reachable, or every Analyze run errors out — no silent degrade.
  - The frontend **requires** `VITE_BUTTERBASE_APP_ID` (and friends) in `.env.local` — it throws at startup otherwise, there's no mock UI to fall back to.
  - Neo4j misconfiguration (e.g. the env-wipe-on-redeploy trap in CLAUDE.md) now surfaces as a real error in the UI instead of a quietly-empty graph/findings list.

## Proposed next steps

Roughly in priority order — pick up whichever is most valuable next, none of these are blocking the core loop:

1. **Relay resilience** — add a lightweight health check / restart-on-crash for `relay.ts` (and ideally `daytona:serve`), and surface relay/Daytona-server health in the UI. With the fallback removed, a dropped relay now visibly breaks every Analyze run (by design) — this item is about catching that fast, not masking it again.
2. **Deploy script hardening** — a single script that pairs `deploy_function` + `update_env` (reading `backend/.env`) for the MCP path, to remove the recurring env-wipe failure mode documented in CLAUDE.md.
3. **Reconcile the two deploy paths** — decide whether `backend/butterbase/functions/*.ts` (CLI path, BB-REST) stays as a parallel implementation or gets retired in favor of the bundled/MCP path that's actually live, to stop the two from silently drifting.
4. **Planner agent** — single LLM call over graph contents (run inside the RocketRide pipeline), inspects the graph and suggests the weakest-evidence area as a next research direction. Was cut for time during the hackathon; UI has a disabled "Plan Next" button already in place as the hook point.
5. **More/real sources for Scout** — currently a small fixed set of pre-picked sources (deliberate, for reliability). Expanding this — more fixtures, or a controlled ingestion path for new sources — increases the graph's real research value without touching the core loop.
6. **Additional Daytona job types** — currently one job type (Pareto scatter, TOPS/W vs Memory_MB, plus a ranking-table view of the same data). A second, genuinely different job type (e.g. per-technique sensitivity analysis) would exercise the sandbox pipeline further, but only worth it once the above reliability items are solid.

## Non-negotiables
- Scout and Analyst are the two agents that must work end-to-end; RocketRide sits between them per the locked call graph in CLAUDE.md — don't restructure without re-reading that section.
- No live web crawling, no PDF ingestion, no auth, no multi-user.
- **No silent fallbacks.** If a dependency (RocketRide pipeline/relay, Neo4j, Butterbase config) isn't available, the corresponding action must fail loudly (thrown error / non-2xx response), not degrade to fake or empty data. If you're tempted to add a "just in case" fallback, don't — wire the real dependency instead or let it error.
- Every function redeploy wipes env vars — always re-set immediately after (see CLAUDE.md for the exact recovery steps).
