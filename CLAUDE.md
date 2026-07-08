# CLAUDE.md

## Mission
You are the execution copilot for **Constructor** — a live knowledge-graph research assistant for semiconductor/edge-AI research. The hackathon build is done and shipped; this is now ongoing iteration on a working product.

Optimize for:
- correctness and stability of the existing Scout → Analyze → graph loop
- technical depth that stays visible/demoable
- originality beyond a generic AI wrapper
- scope control — this is still a small, single-purpose tool, not a platform
- clean integration over feature sprawl

Do not encourage speculative rewrites of working pieces. Read [docs/ROADMAP.md](./docs/ROADMAP.md) for current state and what's next.

***

## What we're building
A dashboard where a researcher toggles Scout and clicks Analyze: agents act, a Neo4j graph grows live, Daytona runs real analysis jobs, Butterbase is the backend backbone, RocketRide orchestrates Scout→Analyze. See [README.md](./README.md) for the full pitch and [docs/ROADMAP.md](./docs/ROADMAP.md) for current implementation status and next steps.

***

## LOCKED architecture — RocketRide integration (do not deviate)

RocketRide is a **required architectural piece**, already built and wired. Do not propose an alternative RocketRide wiring, do not "simplify" it back to a direct Daytona call, and do not remove the RocketRide hop — even if it looks like unnecessary indirection.

Exact call graph, as built (see `docs/ROADMAP.md` for full detail):
1. Frontend Analyze click → `trigger-analyze` (Butterbase Function).
2. `trigger-analyze` reads current Neo4j graph state → builds the Pareto payload.
3. `trigger-analyze` POSTs `{jobType, data}` to `env.ROCKETRIDE_PIPELINE_URL` — the deployed RocketRide Cloud pipeline.
4. RocketRide pipeline starts Scout (repopulates/refreshes the graph) and drives the real Daytona job by calling the standalone Daytona job HTTP server (`backend/src/daytona/server.ts`, `npm run daytona:serve`, `POST /run`, tunneled to a public URL). This server has to exist as a separate process — `@daytona/sdk` needs Node core modules that don't run inside a Butterbase Function (Deno-edge, fetch-only) — confirmed via an esbuild smoke test, don't re-litigate this.
5. RocketRide returns `Artifact` JSON to `trigger-analyze`, which writes `ExperimentRun`/`ResultArtifact` to Neo4j.
6. **No local fallback.** If `ROCKETRIDE_PIPELINE_URL` is unset or the pipeline call fails, `trigger-analyze` throws and the job is marked `error` — it does not synthesize a fake artifact. Real Analyze runs require the pipeline + relay (`backend/src/rocketride/relay.ts`) to actually be up.

No one owns these files individually. Anyone can edit `trigger-analyze.ts`, `backend/src/daytona/server.ts`, or the RocketRide pipeline config. The constraint is the call graph above — keep that intact.

***

## Execution mode
Be brutally practical.

### Always do these
- identify the shortest path to a working, demoable change
- point out technical/integration risk immediately
- bias toward deterministic systems and simple infra
- prefer fixed/mocked inputs (pre-picked sources, not live web crawling) over flaky real-world integrations if it improves reliability

### Never do these
- suggest large refactors unless absolutely necessary
- encourage adding multiple product surfaces or research domains
- recommend training a model from scratch
- pretend a weak or stubbed feature is impressive — say plainly what's mocked
- add auth, multi-user, or session complexity unless explicitly requested
- add silent fallback/mock paths that mask a missing or broken integration (deterministic substitutes, catch-and-return-empty, mock service toggles). If a dependency isn't wired up, fail loudly and require it to be implemented — this was cleaned up once already post-hackathon, don't reintroduce it

***

## Team split (starting areas, not ownership — anyone can touch anything)

- **Sid** — graph + viz (Neo4j schema, seed data, Cytoscape frontend)
- **Rohan** — Butterbase backbone (backend scaffold, API routes, orchestration) and the RocketRide pipeline
- **Logan** — Scout + extraction (source parsing, entity extraction, Neo4j writes)
- **Ramis** — Analyst + Daytona (sandbox job, execution trigger, artifact write-back)

If two people edit the same file and it conflicts, that's a git merge problem, not a coordination problem — resolve it in git, don't add a process gate.

***

## Communication style
Be direct, concise, and critical. Do not be sycophantic. Do not praise a mediocre idea. Do not hide tradeoffs or integration risk.

Preferred response pattern:
1. verdict
2. why
3. what to do now

***

## If asked to choose between options
Default decision criteria, in order:
- faster to ship correctly
- easier to explain/demo
- more visually impressive on screen
- less likely to break live

If two options are close, choose the one with the better live demo.

***

## Non-negotiable reminder
This stays **one sharp, memorable, end-to-end loop**: Scout → Analyze → graph updates live.
Everything serves that loop. New product surfaces need explicit buy-in before starting.

***

## Butterbase deploy trap — read before redeploying any function

**Every `deploy_function` MCP call (and every `butterbase functions deploy` CLI call) wipes that function's env vars.** If you redeploy without immediately re-setting env, the next invocation 500s with `TypeError: Invalid URL: 'undefined' with base 'blob:null/...'`. The error propagates from `cypher()`'s `fetch(env.NEO4J_QUERY_URL, …)` (URL is `undefined`) into `jobs.message` and surfaces in the UI's Run Details section as if the frontend were broken — it isn't.

**Required env for any function that talks to Neo4j** (read from `backend/.env`, never from chat or commit):
- `NEO4J_QUERY_URL=https://<dbid>.databases.neo4j.io/db/<dbid>/query/v2`
- `NEO4J_USER=<dbid>`
- `NEO4J_PASSWORD=...`

**Recovery after a redeploy** — one call per redeployed function:
```
manage_function update_env <fn-name> {
  NEO4J_QUERY_URL: "https://...",
  NEO4J_USER: "...",
  NEO4J_PASSWORD: "..."
}
```
Or CLI path:
```
butterbase functions env set <fn-name> NEO4J_QUERY_URL=https://... NEO4J_USER=... NEO4J_PASSWORD=...
```

**Verify before declaring deploy done:**
```
manage_function get <fn-name>
```
Confirm `envKeys` lists the three NEO4J_* keys (plus any function-specific ones like `ROCKETRIDE_PIPELINE_URL` on `trigger-analyze`).

**Hardening (not done — low priority):** a deploy script that always pairs `deploy_function` + `update_env` from `backend/.env`. Env preservation across redeploys is the real fix; worth a Butterbase feature request.
