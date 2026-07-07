# Backend (Butterbase, TypeScript)

Butterbase-hosted serverless functions (TypeScript on Deno) that back the
Constructor frontend. Postgres holds job state; the knowledge graph lives in
Neo4j. Realtime on the `jobs` table pushes live status to the UI.

## Layout
```
functions/
  trigger-scout.ts     POST → creates a scout job, extracts findings → Neo4j
  trigger-analyze.ts   POST → creates an analyze job, runs Daytona → Neo4j
  get-graph.ts         GET  → whole graph as { nodes, edges } for Cytoscape
  get-findings.ts      GET  → findings feed (newest first)
  get-jobs.ts          GET  → job/task list from Postgres
  get-artifact.ts      POST { ref } → one ResultArtifact payload
lib/
  types.ts             shared contracts (mirror of frontend/src/types.ts)
  neo4j.ts             Neo4j HTTP Query API (v2) helper
  jobs.ts              jobs-table insert/update helpers
schema.sql             jobs table
deploy.sh              schema apply + realtime enable + function deploys
```

## Deploy
```bash
npm i -g @butterbase/cli
butterbase login

export NEO4J_HTTP_URL="https://<dbid>.databases.neo4j.io"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="..."
export DAYTONA_JOB_URL="https://<ramiz-daytona-endpoint>"   # optional
export DAYTONA_API_KEY="..."                                # optional

./deploy.sh
```

## Integration seams (agree with the team)
- **Logan / Neo4j:** `lib/neo4j.ts` `readGraph()` assumes each node has `id`,
  a name-ish property, and a single label matching `NodeType`. If the seed
  schema differs, adjust the RETURN clauses there — nothing else changes.
- **Ramiz / Daytona:** `trigger-analyze.ts` POSTs `{ jobType, data }` to
  `DAYTONA_JOB_URL` and expects an `Artifact` back (`kind: 'table' | 'chart'`).
  If unset, it uses a deterministic fallback so the demo never hard-fails.

## Frontend switch
Once deployed, set in `frontend/.env.local`:
```
VITE_USE_BUTTERBASE=true
VITE_BUTTERBASE_APP_ID=app_xxx
VITE_BUTTERBASE_ANON_KEY=...
```
