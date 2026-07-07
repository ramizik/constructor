# Project Idea: Graph-native Research Command Center for Semiconductor Scientists

## One-liner
A dashboard where a scientist sets a research goal, launches agents, and watches a live knowledge graph grow as agents research, analyze, and write results back — powered by Neo4j (graph), Daytona (execution), Butterbase (backbone), and RocketRide (orchestrator between Scout and Analyst, deployed as a managed RocketRide Cloud endpoint).

## Theme
"Thoughtful Agents for Productivity."

## Time budget reality check
**5 hours left, 4 people. This is not the 24-hour version.** Everything below is pre-cut for that constraint. Do not add scope back in without removing something else first.

## Narrow domain focus
Low-power edge AI accelerator research under thermal and memory constraints.

Demo research goal (hardcode this, don't build goal-editing UI):
> "Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators."

## The 3 agents (build all 3, keep each dumb and fast)

### 1. Scout Agent
**Toggle, not a one-shot button.** Same fixed pool of 2-3 sources (URLs/pasted text, NOT live web crawling) — but instead of dumping all of them in on one click, toggling Scout ON starts a frontend-only `setInterval` (demo cadence, ~20-30s) that calls `trigger-scout` with `{ mode: 'auto' }` each tick. In `auto` mode the Function checks which fixed sources are already ingested (`MATCH (s:Source) RETURN s.id`) and pulls the next un-ingested one relative to the goal/existing Techniques — extracts findings, writes nodes. Once all fixed sources are ingested, further ticks are harmless no-ops (existing MERGE idempotency already guarantees this). Toggle OFF just clears the client-side interval — no backend scheduler, no cron infra. Still a closed fixed pool, just released incrementally instead of all-at-once, so the graph visibly grows during the demo instead of jumping once.

### 2. Analyst Agent
Takes findings from Neo4j → sent to a **RocketRide Cloud pipeline** (must-have, mandated by organizers, **LOCKED design, do not restructure**). Exact call graph:
`trigger-analyze` reads current Neo4j graph state → POSTs `{jobType, data}` to the deployed RocketRide Cloud endpoint → RocketRide starts Scout (refreshes the graph) and drives the real Daytona job by calling the standalone Daytona job HTTP server (`backend/src/daytona/server.ts`, `POST /run`, tunneled public URL — has to be a separate process, `@daytona/sdk` can't run inside a Butterbase Function) → RocketRide returns the `Artifact` JSON → Butterbase writes `ExperimentRun` + `ResultArtifact` back to graph. Deterministic local fallback if the pipeline URL is unset, so the demo never hard-fails. ONE analysis job (pick Type B: comparative ranking, or Type C: Pareto chart — not both).

**Analyze is button + config modal, not a bare click.** User picks job type (pareto/ranking, default pareto) and an optional note before the run starts — same modal pattern as before, just the params now matter (job type actually changes `fallbackArtifact`/pipeline behavior). Every Analyze click creates a **new** run, never overwrites the last one — the right panel is a navigable history of runs (see UI section), not a single status card.

### 3. Planner Agent
Inspects graph → LLM call: "given these findings, what's the weakest-evidence area?" → creates one `AgentTask` suggestion node. This is the cheapest agent to build — a single LLM call over graph contents. Do it last if time allows; cuttable first if not.

## Graph schema (minimal)
Nodes: `ResearchGoal`, `Technique`, `Metric`, `Finding`, `Source`, `ExperimentRun`, `ResultArtifact`, `AgentTask`

Relationships: `SUPPORTS`, `EXTRACTED_FROM`, `TESTS`, `PRODUCES`, `IMPROVES`/`HURTS`, `CREATED`

Do not build the full 12-relationship ontology from the original spec. Add relationship types only when a demo step needs them.

## Sponsor tech roles
- **Butterbase**: backend/app backbone — API layer, task/job state, orchestration glue between UI and Neo4j/Daytona
- **Neo4j**: the graph — techniques, findings, metrics, runs, artifacts
- **Daytona**: isolated sandbox that runs the one analysis job (Python script → chart/table)
- **RocketRide** (must-have, organizer-mandated): orchestrator pipeline sitting between Scout and Analyst. Built visually, deployed to RocketRide Cloud as a managed endpoint — `trigger-analyze` calls it instead of hitting Daytona directly. The pipeline starts/initiates the Daytona job, waits on it, and hands the result back for Butterbase to write to Neo4j. This is now the mechanism that fixes the old "Analyze doesn't really call Daytona" integration risk — see ROADMAP.md.

LLM calls (extraction, ranking-explanation, planner suggestion) run inside the RocketRide pipeline where needed — no separate LLM provider integration (Nebius plan dropped).

## UI (single page, 3 panels)
- **Left**: goal card (static text) + **Scout toggle** (on/off, not a button) + **Analyze button** (opens config modal: job type, optional note) + Plan Next (disabled) + task queue list
- **Center**: graph viz (Cytoscape.js), colored by node type, animates new nodes as Scout ticks land and as Analyze writes back
- **Right**: **run history — a navigable list of Analyze runs**, newest first (seed run included). Click any run to load that run's artifact (chart/table) + one-line takeaway + a small trend view showing how the leading technique's TOPS/W changed across prior runs. Findings feed stays as a secondary feed below the run list.

## Must-have (the demo path — nothing else matters until this works end to end)
1. App scaffold (frontend + Butterbase backend)
2. Neo4j seeded with a small starter graph (5-10 nodes) so the graph isn't empty at demo start
3. Graph visualization renders and updates
4. Scout button → adds real nodes from at least 1 source
5. Analyze button → RocketRide Cloud pipeline orchestrates a real Daytona job → real artifact appears in graph + UI
6. RocketRide pipeline built + deployed to RocketRide Cloud (not just local/Docker) — organizer requirement
7. One clean demo script, rehearsed

## Nice-to-have (only after must-have works and is demoed once)
- Planner agent
- LLM-powered extraction inside the RocketRide pipeline (vs. simpler regex/manual parsing)
- Second Daytona job type
- Contradiction detection
- Graph node click-to-inspect detail panel

## Cut immediately, do not discuss again
- Auth, multi-user, sessions
- Live/broad web crawling
- PDF ingestion
- Full ontology / all relationship types
- Multiple research domains
- Any real backend scheduler/cron for Scout — the toggle's polling is a frontend `setInterval` for demo purposes only, over a closed fixed source pool, not a production ingestion pipeline
- Any "future work" features — this is a demo, not a platform

## Team split
1. **Sid** — Graph + viz: Neo4j schema, seed data, Cytoscape frontend
2. **Rohan** — Butterbase backbone: backend scaffold, API routes, job/task state, wiring frontend↔services
3. **Logan** — Scout + LLM extraction: source parsing, entity extraction, Neo4j writes
4. **Ramis** — Analyst + Daytona: sandbox job script, execution trigger, artifact write-back

**RocketRide pipeline (new, organizer-mandated, cross-cutting)** — owned jointly by **Ramis + Rohan**: sits between Butterbase's `trigger-analyze` and the Daytona SDK job Ramis already built. Ramis exposes the Daytona job logic in a form the pipeline can call; Rohan repoints `trigger-analyze` at the deployed RocketRide Cloud endpoint instead of the current dead Daytona URL stub. Flag before editing `trigger-analyze.ts` or `backend/src/daytona/*` — both are in scope for this change.

Planner agent gets picked up by whoever finishes first.

## Demo script (rehearse this exact sequence)
1. Open dashboard, seeded graph visible, goal shown, run history shows the seed run
2. Toggle **Scout ON** → over ~20-60s, 2-3 sources land one at a time, graph animates growth, findings feed updates
3. Toggle **Scout OFF** once sources are exhausted (or leave it running, it's a harmless no-op past that point)
4. Click **Analyze** → config modal (job type: Pareto, default) → confirm → new run appears at the top of run history, job card shows running (RocketRide pipeline orchestrating the Daytona job in the background) → artifact (chart/table) appears
5. Click between the seed run and the new run in run history → frontier/ranking visibly changed as evidence grew
6. (If time) Click Plan Next → gap suggestion appears
7. Close with the one-line takeaway the analysis produced. Mention RocketRide by name as the orchestrator — it's an organizer-mandated must-have, worth calling out explicitly.

## Checkpoint schedule (5 hours left, loose, adjust live)
- 0:00-0:20: scaffold + schema + seed data + interface contracts agreed and committed
- 0:20-2:00: each track builds independently against agreed interfaces
- 2:00-2:20: first integration checkpoint — does Scout write real nodes? Does Analyze produce a real artifact?
- 2:20-3:40: integrate, fix breakage, cut anything not working
- 3:40-4:20: demo script rehearsal, freeze features
- 4:20-5:00: buffer for bugs, backup recording if live demo is risky
