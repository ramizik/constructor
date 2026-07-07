# Roadmap

Read [PROJECT_IDEA.md](./PROJECT_IDEA.md) first. This file is the execution order — who builds what, in what sequence, against what interface, so nobody blocks anybody.

**Core loop we're shipping:** Scout writes nodes to Neo4j → Analyst reads Neo4j, runs a Daytona job, writes results back to Neo4j → frontend shows all of it live. Planner is a stretch goal only.

---

## Phase 0 (0:00-0:20): Lock interfaces, not code

Nobody writes agent logic until these 3 contracts are written down and everyone's seen them. This is the only phase that's serial — everything after is parallel.

### 1. Neo4j schema (owner: Track 1)
Nodes: `ResearchGoal`, `Technique`, `Metric`, `Finding`, `Source`, `ExperimentRun`, `ResultArtifact`
Relationships: `SUPPORTS`, `EXTRACTED_FROM`, `TESTS`, `PRODUCES`, `IMPROVES`/`HURTS`

Cut `AgentTask` node from schema for now — only needed if Planner gets built.

Deliverable: a `schema.cypher` seed script that creates 5-10 starter nodes so the graph is never empty. Push this first, before anyone else needs to query against it.

### 2. Modal → job param contract (owner: Track 2 + Track 3/4 agree together)
Scout and Analyze buttons don't fire directly — click opens a small modal first, user fills a couple params, modal submit triggers the job. Keep params minimal, hardcode sane defaults so the modal can be submitted with zero typing if a demo run needs speed.

- **Scout modal**: which of the 2-3 fixed sources to pull from (checkbox/select, default all), optional free-text focus hint (e.g. "prioritize thermal techniques") passed into extraction prompt if using LLM extraction.
- **Analyze modal**: which job type param if relevant (only matters if Type B/C ever both exist — for now just a confirm + optional note field), which Findings/Techniques subset to include (default: all in graph).

Modal submit → Butterbase function call (see Track 2 below) with the params as JSON body → function kicks off the agent job async and returns a `job_id` → UI shows the job as running in the left panel task list / right panel status card. Don't block the UI thread on the job.

### 3. Scout → Neo4j write contract (owner: Track 3 + Track 1 agree together) — **LOCKED**
Full node/relationship shapes, merge keys, idempotency rule, and ID-prefix convention are written up in [SCOUT_CONTRACT.md](./SCOUT_CONTRACT.md) and locked in [PHASE0_DECISIONS.md](./PHASE0_DECISIONS.md). Scout runs as a Butterbase Function (TS), writes Neo4j directly (no Daytona in this path).

### 4. Analyst ↔ Daytona job contract (owner: Track 4 + Track 2 agree together) — **LOCKED, job type decided**
Per [PHASE0_DECISIONS.md](./PHASE0_DECISIONS.md) Q3: job is a **Pareto scatter** on two axes — `TOPS/W` (maximize) vs `Memory_MB` (minimize) — with the Pareto frontier highlighted. Ranking-table-on-`TOPS/W` is the built-in fallback if two-axis extraction isn't landing by the 2:00 checkpoint (zero Scout rework needed to degrade).
- Input payload shape (per technique): `{"technique_id","technique","tops_w","memory_mb","higher_is_better":{"tops_w":true,"memory_mb":false}}` — see SCOUT_CONTRACT.md §3/§6.
- Output: chart artifact + `ExperimentRun`/`ResultArtifact` nodes written back to Neo4j (exact fields TBD by Track 4 in Phase 1 — not blocking).
- **Daytona SDK connection confirmed working**: `backend/src/daytona/` scaffolded — `client.ts` (env-based init) + `test-connection.ts` (spins a real sandbox, runs code, tears down). Verified live. Track 4 builds the actual Pareto job script on top of this.

Once these 4 are written in this file or a shared doc, Phase 0 is done. Don't gold-plate the schema — add fields only when a later step needs them.

---

## Phase 1 (0:20-2:00): Parallel build against locked interfaces

Each track builds independently. Nobody touches another track's files — if you need a cross-cutting change (e.g. schema needs a new field), flag it in the team channel, don't silently edit.

- **Track 1 (Graph + viz)**: Cytoscape.js frontend panel, connect to Neo4j read endpoint, render seed graph, color by node type.
- **Track 2 (Butterbase backbone)**: scaffold on Butterbase, don't hand-roll infra it already gives us.
  - **Functions** = the API layer. One function per action: `trigger-scout`, `trigger-analyze`, `job-status`. Each function accepts the modal params as JSON, writes a row to a `jobs` table (status `pending`), kicks off the actual agent work (async — don't make the frontend wait on Scout/Daytona synchronously inside the request), updates the row to `running` → `done`/`error`. Stub the agent body first, real wiring happens Phase 1.5.
  - **Postgres (schema + insert_row/select_rows)** = job/task state. One `jobs` table (`id`, `type` [scout/analyze], `params` jsonb, `status`, `result_ref`, `created_at`) is enough — this replaces any need for custom session/task-queue code.
  - **Realtime** = live UI updates. Configure realtime on the `jobs` table so the frontend gets a websocket push on job status change instead of polling — left-panel task list and right-panel status card subscribe directly. Big demo win for near-zero extra work: use it.
  - If a job needs durable per-run state beyond a status string (e.g. tracking Daytona job progress ticks), consider a Durable Object instead of custom polling — only if time allows, table+realtime is enough for the demo.
- **Track 3 (Scout)**: pick 2-3 fixed sources (URLs or pasted text — no live crawling). Build extraction (regex/manual first, LLM extraction only if time allows) → write to Neo4j per the Phase 0 contract.
- **Track 4 (Analyst)**: repo split into `backend/` (per-tool modules: `daytona/`, `neo4j/`) and `frontend/` — Daytona SDK connection already scaffolded and verified (`backend/src/daytona/client.ts` + `test-connection.ts`). Next: write the Pareto job script (TOPS/W vs Memory_MB per PHASE0_DECISIONS.md Q3), test it standalone (feed it fake data, confirm it produces the artifact), then wire the Neo4j read → Daytona trigger → Neo4j write-back.

### Frontend: 3 panels, 3 buttons, ship this shape from the start
- **Left**: static goal text + 3 buttons (`Scout`, `Analyze`, `Plan Next` — Plan Next visually present but disabled/greyed until Planner exists) + task/status list
- **Center**: Cytoscape graph, animates new nodes on agent completion
- **Right**: job status card + findings feed + latest artifact (image or table)

**Button behavior**: clicking Scout or Analyze does NOT fire the job directly — it opens a small modal (see Phase 0 contract 2) where the user sets params, then submits to actually start the job. Keep the modal to 1-2 fields max and pre-filled with defaults so it can be submitted in one click if needed for demo pacing. Job list/status card should update live via Butterbase realtime, not polling.

No auth, no multi-user, no session state. One page, one goal, hardcoded.

---

## Phase 1.5 (2:00-2:20): First integration checkpoint — do this early, don't wait until it's too late

Stop feature work. Answer two questions with a real click, not a code read:
1. Does clicking **Scout** in the UI write real nodes to Neo4j, visible in the graph?
2. Does clicking **Analyze** trigger a real Daytona job and write a real artifact back to Neo4j, visible in the UI?

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
