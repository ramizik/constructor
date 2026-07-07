# Roadmap

Read [PROJECT_IDEA.md](./PROJECT_IDEA.md) first. This file is the execution order — who builds what, in what sequence, against what interface, so nobody blocks anybody.

**Core loop we're shipping:** Scout writes nodes to Neo4j → Analyst reads Neo4j, runs a Daytona job, writes results back to Neo4j → frontend shows all of it live. Planner is a stretch goal only.

## Status snapshot (updated 2026-07-07, ~1:40 in)

- ✅ Phase 0 — all 4 contracts locked, schema pushed.
- ✅ Phase 1 — frontend (3 panels, modals, mock + Butterbase service toggle), Butterbase functions (`trigger-scout`, `trigger-analyze`, `get-graph`, `get-findings`, `get-jobs`, `get-artifact`), Scout writer, Neo4j client/seed/schema, Daytona SDK scaffold all built.
- ⚠️ **Phase 1.5 checkpoint — not yet clean.** See risk below before declaring the loop done.
- ⬜ Phase 2/3/4 — not started.

### Open integration risk (blocks a clean 1.5 checkpoint)
`trigger-analyze.ts` calls `fetch(`${DAYTONA_API_URL}/pareto`)` — that route doesn't exist on Daytona's real API, so this call always fails and silently falls through to `fallbackArtifact()` (a local SVG generator, no sandbox involved). The actual Daytona SDK path (`backend/src/daytona/batch.ts` + `run-analyze-job.ts`, verified working via `npm run analyze:test`) is never invoked from the deployed function. **Net effect: clicking Analyze today produces a real graph write-back, but the "artifact" is not actually a Daytona sandbox output.** Someone (Ramis, Rohan) needs to decide: wrap the SDK job behind a small HTTP shim Butterbase can call, or call it some other way Butterbase Functions support. Until fixed, don't claim "real Daytona job" in the demo pitch — say plainly what's mocked per CLAUDE.md.

---

## Phase 0 (0:00-0:20): Lock interfaces, not code — ✅ DONE

Nobody writes agent logic until these 3 contracts are written down and everyone's seen them. This is the only phase that's serial — everything after is parallel.

### 1. Neo4j schema (owner: Sid) — ✅ DONE
Nodes: `ResearchGoal`, `Technique`, `Metric`, `Finding`, `Source`, `ExperimentRun`, `ResultArtifact`
Relationships: `SUPPORTS`, `EXTRACTED_FROM`, `TESTS`, `PRODUCES`, `IMPROVES`/`HURTS`

Cut `AgentTask` node from schema for now — only needed if Planner gets built.

Deliverable: a `schema.cypher` seed script that creates 5-10 starter nodes so the graph is never empty. Push this first, before anyone else needs to query against it.

`graph/schema.cypher` pushed and seeded — `neo4j:seed` run confirms 16 nodes live in Aura. Bolt connection verified via `backend/src/neo4j/test-connection.ts` (`npm run neo4j:test` from `backend/`). Deployed Butterbase Functions talk to the same instance over Aura's HTTP Query API v2 (`NEO4J_QUERY_URL`), not bolt — see `backend/.env.example` for the split.

### 2. Modal → job param contract (owner: Rohan + Logan/Ramis agree together)
Scout and Analyze buttons don't fire directly — click opens a small modal first, user fills a couple params, modal submit triggers the job. Keep params minimal, hardcode sane defaults so the modal can be submitted with zero typing if a demo run needs speed.

- **Scout modal**: which of the 2-3 fixed sources to pull from (checkbox/select, default all), optional free-text focus hint (e.g. "prioritize thermal techniques") passed into extraction prompt if using LLM extraction.
- **Analyze modal**: which job type param if relevant (only matters if Type B/C ever both exist — for now just a confirm + optional note field), which Findings/Techniques subset to include (default: all in graph).

Modal submit → Butterbase function call (see Rohan's section below) with the params as JSON body → function kicks off the agent job async and returns a `job_id` → UI shows the job as running in the left panel task list / right panel status card. Don't block the UI thread on the job.

### 3. Scout → Neo4j write contract (owner: Logan + Sid agree together) — **LOCKED**
Full node/relationship shapes, merge keys, idempotency rule, and ID-prefix convention are written up in [SCOUT_CONTRACT.md](./SCOUT_CONTRACT.md) and locked in [PHASE0_DECISIONS.md](./PHASE0_DECISIONS.md). Scout runs as a Butterbase Function (TS), writes Neo4j directly (no Daytona in this path).

### 4. Analyst ↔ Daytona job contract (owner: Ramis + Rohan agree together) — **LOCKED, job type decided**
Per [PHASE0_DECISIONS.md](./PHASE0_DECISIONS.md) Q3: job is a **Pareto scatter** on two axes — `TOPS/W` (maximize) vs `Memory_MB` (minimize) — with the Pareto frontier highlighted. Ranking-table-on-`TOPS/W` is the built-in fallback if two-axis extraction isn't landing by the 2:00 checkpoint (zero Scout rework needed to degrade).
- Input payload shape (per technique): `{"technique_id","technique","tops_w","memory_mb","higher_is_better":{"tops_w":true,"memory_mb":false}}` — see SCOUT_CONTRACT.md §3/§6.
- Output: chart artifact + `ExperimentRun`/`ResultArtifact` nodes written back to Neo4j (exact fields TBD by Ramis in Phase 1 — not blocking).
- **Daytona SDK connection confirmed working**: `backend/src/daytona/` scaffolded — `client.ts` (env-based init) + `test-connection.ts` (spins a real sandbox, runs code, tears down). Verified live. Ramis builds the actual Pareto job script on top of this.
- ✅ Pareto job script built (`batch.ts` + `run-analyze-job.ts`), both frontier and ranking-table paths implemented, tested standalone via `npm run analyze:test` (mock techniques → real Daytona sandbox run). ⚠️ Not yet wired into the deployed `trigger-analyze.ts` Function — see "Open integration risk" at top of this doc.

Once these 4 are written in this file or a shared doc, Phase 0 is done. Don't gold-plate the schema — add fields only when a later step needs them.

---

## Phase 1 (0:20-2:00): Parallel build against locked interfaces

Each track builds independently. Nobody touches another track's files — if you need a cross-cutting change (e.g. schema needs a new field), flag it in the team channel, don't silently edit.

- **Sid (Graph + viz)** — ✅ Cytoscape.js frontend panel built (`GraphCanvas.tsx`), 3-panel layout shipped (`LeftPanel`, `RightPanel`, `Modal`), reads via `get-graph` function.
- **Rohan (Butterbase backbone)** — ✅ scaffolded on Butterbase.
  - **Functions** — ✅ all shipped: `trigger-scout`, `trigger-analyze`, `get-graph`, `get-findings`, `get-jobs`, `get-artifact` (`backend/butterbase/functions/`). Async job kickoff via `ctx.waitUntil`, no blocking on Scout/Daytona.
  - **Postgres** — ✅ `jobs` table in `backend/butterbase/schema.sql` (`id`, `type`, `status`, `params`, `result_ref`, `message`, `created_at`).
  - **Realtime** — not yet confirmed wired to frontend; check before Phase 1.5 checkpoint (left-panel task list / status card should subscribe, not poll).
  - Durable Objects — not needed, table+realtime plan holds.
- **Logan (Scout)** — ✅ `trigger-scout.ts` Function built: deterministic fixture-based extraction (no live crawling), writes Source/Technique/Metric/Finding nodes to Neo4j per the locked contract. Standalone `scout/` package from earlier was merged into the Butterbase function and removed.
- **Ramis (Analyst)** — ✅ repo split (`backend/`, `frontend/`) done. Daytona SDK scaffold verified live. Pareto job script (`batch.ts`/`run-analyze-job.ts`) built and tested standalone. ⚠️ Neo4j read → Daytona trigger → Neo4j write-back loop exists in `trigger-analyze.ts`, but the Daytona call itself is a stub HTTP fetch to a non-existent endpoint — real SDK job isn't reachable from the deployed function yet. See risk note at top.

### Frontend: 3 panels, 3 buttons, ship this shape from the start
- **Left**: static goal text + 3 buttons (`Scout`, `Analyze`, `Plan Next` — Plan Next visually present but disabled/greyed until Planner exists) + task/status list
- **Center**: Cytoscape graph, animates new nodes on agent completion
- **Right**: job status card + findings feed + latest artifact (image or table)

**Button behavior**: clicking Scout or Analyze does NOT fire the job directly — it opens a small modal (see Phase 0 contract 2) where the user sets params, then submits to actually start the job. Keep the modal to 1-2 fields max and pre-filled with defaults so it can be submitted in one click if needed for demo pacing. Job list/status card should update live via Butterbase realtime, not polling.

No auth, no multi-user, no session state. One page, one goal, hardcoded.

---

## Phase 1.5 (2:00-2:20): First integration checkpoint — do this early, don't wait until it's too late

Stop feature work. Answer two questions with a real click, not a code read:
1. Does clicking **Scout** in the UI write real nodes to Neo4j, visible in the graph? — code is in place; **not yet click-tested end-to-end**, confirm with a real browser click before moving on.
2. Does clicking **Analyze** trigger a real Daytona job and write a real artifact back to Neo4j, visible in the UI? — **NO.** Graph write-back works, but the artifact comes from `fallbackArtifact()`, not a real Daytona sandbox run. Fix before claiming this checkpoint is passed.

If either is broken, everyone drops what they're doing and fixes the loop before adding anything else. This checkpoint is the whole point of the roadmap — miss it and the demo is at risk.

---

## Phase 2 (2:20-3:40): Integrate, fix, cut what's broken

- Wire any stubbed Butterbase routes to real Scout/Analyst calls.
- Fix whatever broke at the Phase 1.5 checkpoint.
- If Scout or Analyst is still flaky, simplify the extraction/job logic rather than debugging it further — a dumb version that works beats a smart version that doesn't demo.
- Only now: if both agents are solid and there's real time left, start Planner (single LLM call over graph contents via Nebius — inspects graph, suggests weakest-evidence area as one `AgentTask`-style output). Whoever finishes their track first picks this up. If it's not solid by 3:40, cut it — leave the button greyed out.

---

## Phase 3 (3:40-4:20): Demo script rehearsal, freeze features

No new code. Rehearse the exact sequence:
1. Open dashboard, seeded graph visible, goal shown
2. Click Scout → new nodes animate in, findings feed updates
3. Click Analyze → job card shows running → artifact appears in graph + right panel
4. (Only if Planner shipped) Click Plan Next → gap suggestion appears
5. Close with the one-line takeaway the analysis produced

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
