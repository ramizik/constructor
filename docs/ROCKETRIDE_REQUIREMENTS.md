# RocketRide Requirements — Orchestrator Contract (LOCKED)

**Owner:** Ramis + Rohan, jointly. **Status:** LOCKED — organizer-mandated must-have. Do not redesign, simplify away, or remove the RocketRide hop. See CLAUDE.md "LOCKED architecture" for the enforcement note aimed at other teammates' agents.

---

## 0. What this is

RocketRide Cloud is the orchestrator sitting between Scout and Analyst. It is a scoring requirement from the hackathon organizers, not a technical preference — do not treat it as unnecessary indirection and do not propose a direct Butterbase→Daytona call as a "simplification." A pipeline built visually and deployed to RocketRide Cloud (cloud.rocketride.ai) satisfies the requirement; a pipeline that only runs locally/Docker does not.

---

## 1. Exact call graph (as built — this is the contract, not a proposal)

1. Frontend Analyze click → `trigger-analyze` (Butterbase Function).
2. `trigger-analyze` reads current Neo4j graph state (`Technique -[IMPROVES|HURTS]-> Metric` edges for `TOPS/W` and `Memory_MB`) → builds a `ParetoPoint[]` payload.
3. `trigger-analyze` POSTs `{ jobType: 'pareto'|'ranking', data: ParetoPoint[] }` to `env.ROCKETRIDE_PIPELINE_URL` — the deployed RocketRide Cloud pipeline.
4. The RocketRide pipeline is responsible for:
   - starting Scout (calling the `trigger-scout` Function endpoint, if the pipeline is configured to refresh the graph before analyzing), and
   - driving the real analysis by calling the standalone **Daytona job HTTP server** — `backend/src/daytona/server.ts`, run via `npm run daytona:serve` from `backend/`, exposes `POST /run`, tunneled to a public URL RocketRide can reach.
5. RocketRide returns `Artifact` JSON to `trigger-analyze`.
6. `trigger-analyze` writes `ExperimentRun`/`ResultArtifact` to Neo4j, marks the `jobs` row `done`.
7. If `ROCKETRIDE_PIPELINE_URL` is unset or the pipeline call fails/times out, `trigger-analyze` falls through to `fallbackArtifact()` — a deterministic local SVG/table generator. This keeps the demo crash-proof; it is not dead code to delete.

---

## 2. Why the Daytona job runs as a separate HTTP server, not inside a Function

`@daytona/sdk` requires Node core modules (`fs`, `module`, etc.) that don't exist in Butterbase's Function runtime (Deno-edge, fetch-only) — confirmed via an esbuild `--bundle --platform=neutral` smoke test. So the real Daytona sandbox job (`backend/src/daytona/batch.ts`) is wrapped behind a standalone Node HTTP server (`server.ts`) instead, and RocketRide calls that server as one step in its pipeline. Don't re-litigate this or try to inline Daytona into a Function — it doesn't run there.

---

## 3. Contract the pipeline must satisfy

**Input** (from `trigger-analyze`, matches `server.ts` exactly):
```json
{ "jobType": "pareto" | "ranking", "data": [
  { "technique_id": "tech_...", "technique": "...", "tops_w": 4.2, "memory_mb": 1.8,
    "higher_is_better": { "tops_w": true, "memory_mb": false } }
] }
```

**Output** (`Artifact`, either shape):
```json
{ "kind": "chart", "title": "...", "image_url": "data:image/svg+xml;...", "takeaway": "..." }
```
```json
{ "kind": "table", "title": "...", "columns": [...], "rows": [[...]], "takeaway": "..." }
```

Same shape `fallbackArtifact()` and `toArtifact()` (`backend/src/daytona/artifact.ts`) already produce — the pipeline is a drop-in once deployed, no downstream code changes needed.

---

## 4. Deployment steps (what's left to do)

1. Start the Daytona job server: `npm run daytona:serve` (from `backend/`), confirm `POST /run` responds locally.
2. Tunnel it to a public URL (ngrok or equivalent) — RocketRide Cloud needs a reachable endpoint, not localhost.
3. Build the RocketRide pipeline visually (in RocketRide's VS Code tooling): node(s) to call `trigger-scout` (optional, if refreshing graph per-run) and a node to POST to the tunneled Daytona server URL from step 2.
4. Deploy the pipeline to RocketRide Cloud (cloud.rocketride.ai) — get the live managed endpoint URL. Local/Docker-only does not satisfy the organizer requirement.
5. Set `ROCKETRIDE_PIPELINE_URL` on the deployed `trigger-analyze` function:
   - MCP-deployed app (`app_c6q2usx31f76`): `manage_function` action `update_env`, `{ ROCKETRIDE_PIPELINE_URL: "<endpoint>" }` — no code change, no redeploy.
   - CLI-deploy path (`deploy.sh`): set `ROCKETRIDE_PIPELINE_URL` in `backend/.env` before running it.
6. Re-run Analyze from the UI, confirm the artifact is real (Daytona Monte-Carlo CI95 error bars present, per `artifact.ts`) instead of the flat fallback SVG.

---

## 5. Env vars

| Var | Where | Notes |
|---|---|---|
| `ROCKETRIDE_PIPELINE_URL` | `trigger-analyze` function env | Empty today → fallback path active. Placeholder in `backend/.env.example`. |
| `DAYTONA_API_KEY` | `backend/.env`, used by `server.ts`/`batch.ts` | Already set, verified live (`npm run daytona:test`). |
| `PORT` | `server.ts` (optional) | Defaults to `8787`. |

---

## 6. Files in scope / out of scope

**In scope for this integration:**
- `backend/src/daytona/server.ts`, `artifact.ts` — Ramis.
- `backend/butterbase/functions/trigger-analyze.ts`, `bundled/trigger-analyze.ts`, `bundled/trigger-analyze.deploy.ts`, `_lib.ts`/`_shared.ts.inc` (env typing only) — Rohan.
- RocketRide pipeline config itself (lives on cloud.rocketride.ai, not in this repo).

**Out of scope — do not touch without flagging Ramis/Rohan first:**
- `graph/schema.cypher`, Neo4j writer Cypher — unrelated, don't touch for this.
- `trigger-scout.ts` core extraction logic — RocketRide only calls it as a black box, doesn't change its internals. (See `docs/ANALYZER_REQUIREMENTS.md` if extending Scout's own extraction — separate, unrelated effort.)
- Frontend Analyze button behavior — stays as-is, still calls `trigger-analyze` directly; RocketRide is invisible to the frontend.

---

## 7. Verification before calling this done

1. `npm run daytona:serve` running + tunneled → confirm `POST /run` returns a real `Artifact` with CI95 error bars, not the flat fallback.
2. RocketRide pipeline deployed to RocketRide Cloud (not localhost) — confirm by hitting the live endpoint URL directly, not through `trigger-analyze`.
3. `ROCKETRIDE_PIPELINE_URL` set on the deployed function, `manage_function`/`update_env` confirmed applied.
4. Click Analyze in the real UI → artifact shown is sourced from the real sandbox run (check for CI95 bars / `job_id` prefix `pipeline_...` in the payload), not `fallbackArtifact()`.
5. Kill the tunnel / unset the URL → confirm graceful fallback, no broken UI, no unhandled `jobs` error state.

---

## Open questions to close

1. **[Rohan]** Does the RocketRide pipeline also call `trigger-scout` as part of this run, or is Scout still purely frontend-button-triggered, separate from the Analyze pipeline? Decide and document the answer here once settled — currently ambiguous, both are compatible with the Daytona-calling contract above.
2. **[Ramis]** Tunnel provider for `server.ts` (ngrok vs alternative) — pick one, needs to stay up through the demo window.
3. **[Ramis + Rohan]** Who actually builds the RocketRide pipeline nodes in RocketRide's tool — assign before Phase 2 ends, this is the last unbuilt piece of the locked architecture.
