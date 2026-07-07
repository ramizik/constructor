# Project Idea: Graph-native Research Command Center for Semiconductor Scientists

## One-liner
A dashboard where a scientist sets a research goal, launches agents, and watches a live knowledge graph grow as agents research, analyze, and write results back — powered by Neo4j (graph), Daytona (execution), Butterbase (backbone), and optionally Nebius (LLM).

## Theme
"Thoughtful Agents for Productivity."

## Time budget reality check
**8 hours, 4 people. This is not the 24-hour version.** Everything below is pre-cut for that constraint. Do not add scope back in without removing something else first.

## Narrow domain focus
Low-power edge AI accelerator research under thermal and memory constraints.

Demo research goal (hardcode this, don't build goal-editing UI):
> "Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators."

## The 3 agents (build all 3, keep each dumb and fast)

### 1. Scout Agent
Takes a small fixed set of pre-selected sources (2-3 URLs or pasted text, NOT live web crawling if time is short) → extracts techniques/metrics/findings via LLM → writes nodes to Neo4j.

### 2. Analyst Agent
Takes findings from Neo4j → sends to Daytona → runs ONE analysis job (pick Type B: comparative ranking, or Type C: Pareto chart — not both) → writes `ExperimentRun` + `ResultArtifact` back to graph.

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
- **Nebius** (optional, cut first if behind): LLM calls for extraction/ranking-explanation/planner suggestion

## UI (single page, 3 panels)
- **Left**: goal card (static text) + 3 buttons (Scout / Analyze / Plan Next) + task queue list
- **Center**: graph viz (Cytoscape.js), colored by node type, animates new nodes on agent completion
- **Right**: job status card + findings feed + latest artifact (table or chart image)

## Must-have (the demo path — nothing else matters until this works end to end)
1. App scaffold (frontend + Butterbase backend)
2. Neo4j seeded with a small starter graph (5-10 nodes) so the graph isn't empty at demo start
3. Graph visualization renders and updates
4. Scout button → adds real nodes from at least 1 source
5. Analyze button → real Daytona job runs → real artifact appears in graph + UI
6. One clean demo script, rehearsed

## Nice-to-have (only after must-have works and is demoed once)
- Planner agent
- Nebius-powered extraction (vs. simpler regex/manual parsing)
- Second Daytona job type
- Contradiction detection
- Graph node click-to-inspect detail panel

## Cut immediately, do not discuss again
- Auth, multi-user, sessions
- Live/broad web crawling
- PDF ingestion
- Full ontology / all relationship types
- Multiple research domains
- Autonomous continuous loop (agents run on click only, not on a timer)
- Any "future work" features — this is a demo, not a platform

## Team split (4 people, suggested)
1. **Graph + viz**: Neo4j schema, seed data, Cytoscape frontend
2. **Butterbase backbone**: backend scaffold, API routes, job/task state, wiring frontend↔services
3. **Scout + LLM extraction**: source parsing, entity extraction, Neo4j writes
4. **Analyst + Daytona**: sandbox job script, execution trigger, artifact write-back

Planner agent gets picked up by whoever finishes first.

## Demo script (rehearse this exact sequence)
1. Open dashboard, seeded graph visible, goal shown
2. Click Scout → new nodes animate in, findings feed updates
3. Click Analyze → job card shows running → artifact (chart/table) appears in graph + right panel
4. (If time) Click Plan Next → gap suggestion appears
5. Close with the one-line takeaway the analysis produced

## Hour-by-hour checkpoint (loose, adjust live)
- Hour 0-1: scaffold + schema + seed data agreed and committed
- Hour 1-3: each track builds independently against agreed interfaces
- Hour 3-4: first integration checkpoint — does Scout write real nodes? Does Analyze produce a real artifact?
- Hour 4-6: integrate, fix breakage, cut anything not working
- Hour 6-7: demo script rehearsal, freeze features
- Hour 7-8: buffer for bugs, backup recording if live demo is risky
