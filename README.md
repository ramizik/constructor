# Constructor — Graph-native Research Command Center

Hackathon project: a dashboard where a semiconductor researcher sets a goal, launches agents, and watches a live knowledge graph grow as agents research, execute analyses, and write results back.

See [PROJECT_IDEA.md](./docs/PROJECT_IDEA.md) for full spec, scope cuts, and demo script.
See [CLAUDE.md](./CLAUDE.md) for how the coding agent should operate on this repo.

## Stack
- Frontend: React + Vite + TypeScript, Tailwind, Cytoscape.js for graph viz
- Backend/orchestration: Butterbase
- Graph DB: Neo4j
- Execution sandbox: Daytona
- Pipeline orchestrator (Scout → Analyst): RocketRide, deployed to RocketRide Cloud

## Status
Hackathon build in progress. 8-hour build window, 4 contributors.

## Setup
_TODO: fill in once scaffold exists — install steps, env vars, run commands._

## Environment variables
Copy `.env.example` to `.env` and fill in:
```
NEO4J_URI=
NEO4J_USER=
NEO4J_PASSWORD=
NEO4J_DATABASE=
DAYTONA_API_KEY=
BUTTERBASE_APP_ID=
ROCKETRIDE_PIPELINE_URL=   # deployed RocketRide Cloud endpoint, called from trigger-analyze
```

## Repo layout (target)
```
/frontend        React app (goal panel, graph canvas, job/findings panel)
/backend          Butterbase functions/routes, agent orchestration
/daytona-jobs     Analysis scripts run inside Daytona sandbox
/graph            Neo4j schema + seed data scripts
```
