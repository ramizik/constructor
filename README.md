# Constructor


Demo: https://youtube.com/shorts/cXUEV2w5vZ4?feature=share

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/653d3820-4926-46d8-b68c-67029221c573" />



**A live knowledge graph for semiconductor research — agents research, execute, and write results back to the graph in real time.**

## Problem

Hardware researchers evaluating edge-AI accelerator techniques (quantization, sparsity, weight streaming, etc.) juggle scattered papers, spreadsheets, and one-off scripts. There's no single place that connects *claims* (papers/notes) → *techniques* → *measured tradeoffs* → *experiments*, and updates live as new evidence and analysis come in.

## What we built

An autonomous research assistant that scouts sources, runs real experiments, and grows a **live Neo4j knowledge graph** on its own — the researcher just sets the goal and watches agents work:

> *"Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators."*

Two actions drive the whole loop:
- **Scout** — ingests fixed sources (papers/notes) into the graph as Technique/Metric/Finding nodes, one source at a time, so the graph visibly grows.
- **Analyze** — pulls every technique's TOPS/W vs. Memory tradeoff out of the graph, runs a real Monte-Carlo simulation per technique in an isolated **Daytona** sandbox (orchestrated via a **RocketRide** Cloud pipeline), computes the Pareto frontier, and writes a new `ExperimentRun`/`ResultArtifact` back into the graph — visible immediately in the UI as a chart + one-line takeaway.

Every run is kept, not overwritten — the right panel is a navigable history of runs with a trend view of the leading technique across time.

---

## Sponsor tech — what each one does here

| Tool | Role in this project |
|---|---|
| **Neo4j** (Aura) | The graph itself — `ResearchGoal`, `Technique`, `Metric`, `Finding`, `Source`, `ExperimentRun`, `ResultArtifact` nodes, connected by `SUPPORTS`, `EXTRACTED_FROM`, `TESTS`, `PRODUCES`, `IMPROVES`/`HURTS`. Every Scout tick and every Analyze run is a real Cypher write via Aura's HTTP Query API v2 — nothing in the graph is faked for the demo. |
| **Butterbase** | The backend backbone. Six serverless Functions (`get-graph`, `get-findings`, `get-jobs`, `get-artifact`, `get-run-history`, `trigger-scout`, `trigger-analyze`) are the only surface the frontend talks to — they read/write Neo4j and track job state, and the built frontend is deployed on Butterbase's static hosting too. |
| **Daytona** | The execution sandbox. Each technique gets its own isolated Python sandbox (`daytona.create({language:'python'})`) running a real Monte-Carlo simulation (500 samples, Gaussian noise) over its TOPS/W and Memory figures, then the sandbox is torn down. This is the only place actual computation happens outside the graph. |
| **RocketRide** | The orchestrator between Scout and Analyst — organizer-mandated, deployed as a managed RocketRide Cloud pipeline. `trigger-analyze` never calls Daytona directly; it POSTs to the RocketRide pipeline, which re-runs Scout (freshens the graph) and drives the real Daytona job via a tunneled HTTP server, then hands back the artifact. Required — if the pipeline is unreachable, Analyze fails loudly rather than faking a result. |

---

## Pipelines / algorithms that run when you use the app

### 1. Scout pipeline (`trigger-scout`, auto mode)
1. Frontend toggle fires `trigger-scout({mode:'auto'})` every ~20s.
2. Function checks which of 3 fixed sources are already ingested (`MATCH (s:Source)`), picks the next un-ingested one.
3. For each measurement in that source: `MERGE`s `Source` / `Technique` / `Metric` / `Finding` nodes and `IMPROVES`/`HURTS` edges into Neo4j — idempotent, so repeat ticks are harmless no-ops once the pool is exhausted.
4. Toggle auto-flips OFF when the pool is empty.

Sources are a fixed, pre-picked set (not live web crawling) — deliberate, for demo reliability.

### 2. Analyze pipeline (`trigger-analyze` → RocketRide → Daytona)
1. `trigger-analyze` queries Neo4j for every `Technique`'s TOPS/W and Memory_MB edges, builds a `ParetoPoint[]` payload.
2. POSTs `{jobType, data}` to the deployed RocketRide Cloud pipeline.
3. RocketRide starts Scout again, then calls the standalone Daytona job server (`POST /run`) over a public tunnel — `@daytona/sdk` needs Node core modules that can't run inside Butterbase's Deno-edge Functions, so this has to be a separate process.
4. For each technique, in parallel: spin up a Daytona sandbox, run a Monte-Carlo simulation (500 samples, 5% relative std) over its TOPS/W and Memory_MB, tear the sandbox down.
5. Compute the Pareto frontier (non-dominated techniques on TOPS/W↑ vs Memory↓), build a chart/table artifact + one-line takeaway.
6. RocketRide returns the `Artifact` JSON; `trigger-analyze` writes a new `ExperimentRun`/`ResultArtifact` into Neo4j and marks the job done.
7. If `ROCKETRIDE_PIPELINE_URL` is unset or the pipeline call fails, `trigger-analyze` throws and the job is marked `error` — there's no local substitute artifact.

---

## Stack
- **Frontend**: React + Vite + TypeScript, Tailwind, Cytoscape.js
- **Backend**: Butterbase Functions
- **Graph**: Neo4j Aura
- **Execution**: Daytona sandboxes
- **Orchestration**: RocketRide Cloud pipeline (Scout ↔ Analyst ↔ Daytona)

## Repo layout
```
/frontend    React app — graph canvas, goal/scout/analyze panel, run history panel
/backend     Butterbase functions (Neo4j reads/writes), Daytona job server + batch simulation
/graph       Neo4j schema + seed data
/docs        Roadmap — current status + next steps
```

## Setup
1. `cp backend/.env.example backend/.env`, fill in Neo4j Aura, Daytona, Butterbase, and RocketRide credentials.
2. `cd backend && npm install`, `cd frontend && npm install`.
3. Seed Neo4j: see `graph/` scripts.
4. Run the Daytona job server standalone: `npm run daytona:serve` (tunnel it, point RocketRide's pipeline config at the tunnel URL).
5. Deploy Butterbase functions; `manage_function update_env` to set `NEO4J_QUERY_URL`, `NEO4J_USER`, `NEO4J_PASSWORD`, and `ROCKETRIDE_PIPELINE_URL` on `trigger-analyze` (redeploying a function wipes its env — always re-set after redeploy).
6. `cd frontend && npm run dev`, or deploy via Butterbase static hosting.

See [docs/ROADMAP.md](./docs/ROADMAP.md) for current implementation status and next steps, and [CLAUDE.md](./CLAUDE.md) for locked architecture decisions.
