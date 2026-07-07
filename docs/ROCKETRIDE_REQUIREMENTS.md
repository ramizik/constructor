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
   - starting Scout (calling the `trigger-scout` Function endpoint, best-effort/non-blocking — see §8), and
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

## 4. Deployment steps

1. ✅ Daytona job server running, tunneled via localtunnel (`loca.lt`) — current URL in `.env` (`ROCKETRIDE_DAYTONA_URL`). **Tunnel URL is ephemeral**: it changes if the tunnel process restarts. Update `.env` and the pipeline's `tool_http_request` `urlWhitelist` entry (`constructor-pipeline.pipe`) together whenever it does.
2. ✅ Pipeline built at `constructor-pipeline.pipe` (repo root) — see §8 for the actual shape. Built by hand-editing the `.pipe` file with the RocketRide VS Code extension (`rocketride.rocketride`) installed and connected, rather than the visual canvas.
3. ✅ **Deployed to RocketRide Cloud, confirmed persistent.** Earlier belief that this was GUI-only (VS Code "Deploy" webview, no CLI/API) was wrong — the VS Code sidebar's "Run"/"Stop" only starts an interactive, session-tied execution, but the TS SDK exposes a separate `client.deploy` namespace (`add`/`remove`/`list`/`status`/`update`, backed by `rrext_deploy_*` DAP commands — not documented in the locally-bundled `.rocketride/docs/`, found via `docs.rocketride.org/develop/typescript/methods/deploy`) that persists a pipeline server-side, independent of any connection. Deployed via a small script: `rocketride-deploy/deploy.mjs` (repo root, `npm install` + `node deploy.mjs`) — reads `constructor-pipeline.pipe`, connects with `ROCKETRIDE_URI`/`ROCKETRIDE_APIKEY`, calls `client.deploy.add(pipeline, { schedule: 'manual' })`. Returned `state: "active"`. **Verified persistence**: hit the webhook URL again after the script's connection had fully closed — still `200 OK`. Re-run `node rocketride-deploy/deploy.mjs` any time `constructor-pipeline.pipe` changes to push the update live (idempotent per `project_id` — watch for the churn issue in §9 item 1, a new `project_id` means a *new* deployment, not an update to the old one).
4. ✅ **Live trigger URL + auth confirmed by direct `curl`:** `POST https://api.rocketride.ai/webhook?auth=<public-key>` with header `Authorization: Bearer <private-token>` → `200 OK`. Real values in `.env` (`ROCKETRIDE_WEBHOOK_PUBLIC_KEY`, `ROCKETRIDE_WEBHOOK_TOKEN`; gitignored, not repeated here). The public key routes to this pipeline via the query string; the private token is required as a bearer header or the call 422s (`"missing: header.authorization"`) — the query param alone is not sufficient auth, confirmed empirically.
5. 🛑 **Blocked on §9 item 2 before going further** — the webhook response is an async ingestion ack (`{"status":"OK","data":{"objectId":...}}`), **not** the pipeline's `Artifact` JSON. `trigger-analyze.ts`'s current `res.json() as Artifact` will never get a real artifact this way. Do not set `ROCKETRIDE_PIPELINE_URL` on `trigger-analyze` until this is resolved — it would either error every job or silently misparse the ack as a malformed artifact.

---

## 5. Env vars

| Var | Where | Notes |
|---|---|---|
| `ROCKETRIDE_PIPELINE_URL` | `trigger-analyze` function env | Empty today → fallback path active. Placeholder in `backend/.env.example`. |
| `DAYTONA_API_KEY` | `backend/.env`, used by `server.ts`/`batch.ts` | Already set, verified live (`npm run daytona:test`). |
| `PORT` | `server.ts` (optional) | Defaults to `8787`. |

**Consumed by `constructor-pipeline.pipe` itself** (root `.env`/`.env.example`, substituted via RocketRide's `${ROCKETRIDE_*}` mechanism at deploy time — separate from the vars above, which live in Butterbase's function env):

| Var | Notes |
|---|---|
| `ROCKETRIDE_URI` / `ROCKETRIDE_APIKEY` | RocketRide **platform** auth (extension/SDK → cloud.rocketride.ai) — this is what "connects RocketRide" itself. Filled in `.env` 2026-07-07 (value not repeated here — see `.env`, gitignored). Not the same as the LLM key below — see next row. |
| `ROCKETRIDE_MINIMAX_KEY` | Orchestrator agent's LLM (MiniMax M3, swapped from Claude Sonnet 4.6 on 2026-07-07 per user request). Powers **only** the relay agent inside the pipeline — has nothing to do with Scout or Analyst, which are both fully deterministic/no-LLM. Filled in `.env` 2026-07-07 (value not repeated here — see `.env`, gitignored). |
| `ROCKETRIDE_DAYTONA_URL` | Tunneled Daytona job server, e.g. `https://<subdomain>.loca.lt/run`. Ephemeral — see §4. |
| `ROCKETRIDE_TRIGGER_SCOUT_URL` | `https://api.butterbase.ai/v1/app_c6q2usx31f76/fn/trigger-scout` — confirmed live via Butterbase MCP `manage_function(list)`, not a guess. |
| `ROCKETRIDE_BUTTERBASE_KEY` | Currently unused by the pipeline (see §9 item 3) — `trigger-scout`'s trigger is now `auth:'none'`, so no bearer token is needed. Kept in `.env` in case a future call needs an authenticated Butterbase endpoint. |

---

## 6. Files in scope / out of scope

**In scope for this integration:**
- `backend/src/daytona/server.ts`, `artifact.ts` — Ramis.
- `backend/butterbase/functions/trigger-analyze.ts`, `bundled/trigger-analyze.ts`, `bundled/trigger-analyze.deploy.ts`, `_lib.ts`/`_shared.ts.inc` (env typing only) — Rohan.
- `constructor-pipeline.pipe` (repo root) — the actual RocketRide pipeline definition, now built and tracked in this repo (previously lived only on cloud.rocketride.ai).
- `trigger-scout`'s **deployed trigger auth config only** (`auth: 'required' → 'none'`) — see item below, this was a deliberate, flagged, user-approved exception to the out-of-scope rule.

**Out of scope — do not touch without flagging Ramis/Rohan first:**
- `graph/schema.cypher`, Neo4j writer Cypher — unrelated, don't touch for this.
- `trigger-scout.ts` core extraction logic (the Cypher writes, fixture data, job bookkeeping) — RocketRide only calls it as a black box, doesn't change its internals. (See `docs/ANALYZER_REQUIREMENTS.md` if extending Scout's own extraction — separate, unrelated effort.) **Exception made 2026-07-07:** the function's deployed *trigger config* (not its code) was redeployed with `auth: 'none'` instead of `'required'` — flagged to the user first, explicitly approved. Reason: `auth: 'required'` rejects `bb_sk_...` service keys and demands an end-user JWT (confirmed via both a direct `curl` and Butterbase's own `invoke_function` MCP tool — both got `401 AUTH_REQUIRED`), which the RocketRide pipeline can never present since it's a server-to-server caller and this project has no end-user auth system (per CLAUDE.md's explicit "no auth" scope cut). Function source code, Cypher, and fixture data are byte-for-byte unchanged; `envVars` (Neo4j creds etc.) were preserved (confirmed via `manage_function get` before/after — same `envKeys`, redeploy omitted `envVars` entirely rather than risk resending stale/wrong values).
- Frontend Analyze button behavior — stays as-is, still calls `trigger-analyze` directly; RocketRide is invisible to the frontend.

---

## 7. Verification before calling this done

1. `npm run daytona:serve` running + tunneled → confirm `POST /run` returns a real `Artifact` with CI95 error bars, not the flat fallback.
2. RocketRide pipeline deployed to RocketRide Cloud (not localhost) — confirm by hitting the live endpoint URL directly, not through `trigger-analyze`.
3. `ROCKETRIDE_PIPELINE_URL` set on the deployed function, `manage_function`/`update_env` confirmed applied.
4. Click Analyze in the real UI → artifact shown is sourced from the real sandbox run (check for CI95 bars / `job_id` prefix `pipeline_...` in the payload), not `fallbackArtifact()`.
5. Kill the tunnel / unset the URL → confirm graceful fallback, no broken UI, no unhandled `jobs` error state.

---

## 8. Pipeline shape (as built, `constructor-pipeline.pipe`)

```
webhook (receives trigger-analyze's POST)
  → question (wraps the raw JSON body as a Question so the agent can read it)
  → agent_rocketride "RocketRide Orchestrator"
       [control: llm_minimax (minimax-m3), memory_internal (required by agent_rocketride), tool_http_request]
  → response_answers (returns the agent's final answer as `answers[0]`)
```

The orchestrator agent is instructed (not hardcoded logic — see §9 item 1 for the risk this implies) to, in order:
1. Parse the incoming `{ jobType, data }` JSON verbatim.
2. **Best-effort, non-blocking:** POST `{}` to `${ROCKETRIDE_TRIGGER_SCOUT_URL}` to nudge Scout. Ignore any failure and never retry — this must not be able to break the Daytona call below.
3. **Required:** POST the exact `{ jobType, data }` object, unmodified, to `${ROCKETRIDE_DAYTONA_URL}`.
4. Return that response's raw JSON body verbatim as its final answer — no commentary, no markdown, no code fences. On failure, return a literal fallback error-shaped JSON instead (`{"kind":"table",...}`) so the response is always valid JSON even when Daytona is unreachable.

`tool_http_request`'s `urlWhitelist` is scoped to the Daytona tunnel domain and `api.butterbase.ai` only — no other outbound calls are possible from this pipeline.

## 9. Open items before this is demo-ready

1. **THE blocker: webhook trigger is async-only, `trigger-analyze.ts` expects sync.** Confirmed by direct testing (§4 items 4-5), not speculation anymore: `POST /webhook?auth=...` returns an ingestion ack (`{"status":"OK","data":{"objectId":...}}`) immediately, then the pipeline runs in the background. The *only* documented way to retrieve the actual result is over a WebSocket — either the SDK's own `send()`/`chat()` session, or the separate observability DAP socket subscribed to `apaevt_flow`, waiting for `op:"end"`. There is no plain REST "poll this URL for the result" endpoint. `trigger-analyze.ts`'s bare `fetch()` + `res.json() as Artifact` fundamentally cannot work against this.
   **Recommended fix** (proposed, not yet built — this touches the CLAUDE.md-locked call graph, needs Rohan/Ramis sign-off before implementing): flip `trigger-analyze` to fire-and-forget, matching the async-job pattern already used everywhere else in this app (`jobs` table + realtime). Add one new small Butterbase function (e.g. `rocketride-callback`) that receives the final artifact JSON and writes `ExperimentRun`/`ResultArtifact` + marks the job `done` — what `trigger-analyze` does today, moved to a callback. The pipeline's orchestrator agent (§8) gets a 4th instruction: after getting Daytona's response, POST it to that callback URL.
2. **`project_id` churn, now with real consequences.** Every time `constructor-pipeline.pipe` is saved (even a plain text edit, not the visual canvas), something — presumably the connected RocketRide VS Code extension's sync — rewrites `project_id` to a brand-new random GUID. Observed across 7+ consecutive edits in this session. Since `deploy.add()` creates a deployment keyed by `project_id`, **each churn during active development risks leaving an orphaned `active` deployment behind** rather than updating the live one. Check `client.deploy.list()` (or the RocketRide dashboard) periodically and `deploy.remove(oldProjectId)` any stale ones — otherwise multiple pipeline versions may be simultaneously live and reachable, which is confusing at best.
3. **Daytona tunnel latency/stability unverified end-to-end through the deployed pipeline.** Direct `curl` tests against the tunnel URL during this session got inconsistent `408`/`502` responses before stabilizing — worth a full round-trip test once item 1 is resolved and results are actually retrievable, not just a bare `curl` to `/run`.
4. **LLM-mediated relay is inherently less deterministic than a direct call.** RocketRide has no "plain HTTP forward" data-lane node — `tool_http_request` is agent-invoked only — so the Daytona artifact JSON passes through an LLM's hands on the way back. The agent is instructed to reproduce it byte-for-byte, but an LLM occasionally paraphrasing, wrapping in markdown, or otherwise mangling a large JSON payload is a real (if now mitigated) demo risk. Test with real payload sizes once item 1 is resolved, not just the 1-technique smoke test used during this session.

## Resolved (previously "Open questions to close")

1. ~~Does the RocketRide pipeline also call `trigger-scout`?~~ **Yes** — best-effort, non-blocking (§8, step 2). Decided 2026-07-07.
2. ~~Tunnel provider for `server.ts`?~~ **localtunnel (`loca.lt`)**, currently running. Ephemeral URL — see §4.
3. ~~Who builds the RocketRide pipeline nodes?~~ Built 2026-07-07 (this session), hand-editing `constructor-pipeline.pipe` with the RocketRide VS Code extension connected.
4. ~~All required credentials filled in?~~ **Yes**, as of 2026-07-07: `ROCKETRIDE_URI`/`ROCKETRIDE_APIKEY` (platform), `ROCKETRIDE_MINIMAX_KEY` (orchestrator LLM), `ROCKETRIDE_DAYTONA_URL`, `ROCKETRIDE_TRIGGER_SCOUT_URL` all set in `.env`.
5. ~~Is the pipeline actually deployed to RocketRide Cloud, not just running interactively?~~ **Yes**, as of 2026-07-07 — `client.deploy.add()` via `rocketride-deploy/deploy.mjs`, `state: "active"`, confirmed reachable after the deploying script's own connection closed. See §4 items 3-4.
