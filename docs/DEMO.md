# Demo Script

Target run length: 3-4 min. Live at `https://constructor-hackathon.butterbase.dev`.
Status tags per step: ✅ built + verified live · ⚠️ built but degraded/fallback · ⬜ not built yet.

---

## Script

**1. Open dashboard** ✅
Seeded graph visible (16 nodes: goal, 3 techniques, 2 metrics, sources, findings, 1 seed `ExperimentRun`/`ResultArtifact`), goal text shown: *"Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators."*

**2. Toggle Scout ON** ⬜ **not built**
Target: toggle starts a client-side interval, `trigger-scout({mode:'auto'})` fires every ~20-30s, picks the next un-ingested fixed source, graph grows one source at a time.
**Today's fallback:** Scout is still a single button (old contract). Clicking it once calls `trigger-scout` with no params, which ingests **all** fixed sources in one shot (verified live: added 16 nodes in one run). Use this — click Scout once, narrate "in the full build this happens incrementally as a toggle; today it's one batch for time."

**3. Toggle Scout OFF once exhausted** ⬜ **not built** (n/a with current one-shot button — skip this line in the fallback path)

**4. Click Analyze → config modal (job type: Pareto, optional note) → confirm** ✅ modal exists / ⚠️ artifact is fallback
`trigger-analyze` reads current graph, POSTs to `ROCKETRIDE_PIPELINE_URL`. **Pipeline isn't deployed yet** (URL unset), so it falls through to a deterministic local Pareto-frontier SVG generator — real `ExperimentRun`/`ResultArtifact` nodes are written to Neo4j (verified live), but the chart is not a real Daytona sandbox output. **Say this plainly during the demo**, don't imply it's sandboxed.

**5. Right panel: click between runs, see history + trend** ⬜ **not built**
Target: navigable run list, click a run → its artifact + takeaway + trend sparkline across prior runs.
**Today's fallback:** right panel shows the single latest job status card + findings feed. No run history list, no trend view yet. If not built by rehearsal, narrate the *idea* verbally over the current single-artifact view rather than pretending to click through history.

**6. (If Planner shipped) Click Plan Next** ⬜ **not built, stretch-only**
Button exists, disabled/greyed. Skip this step entirely unless built.

**7. Close** — one-line takeaway from the artifact (`takeaway` field, e.g. *"Near-Memory Compute leads on TOPS/W but costs memory"*). Explicitly name **RocketRide** as the orchestrator (organizer-mandated must-have) even if the pipeline itself isn't deployed — say "wired and ready, pipeline deploy is the last mile."

---

## What's real right now (verified live, not claims)
- Butterbase app `app_c6q2usx31f76` deployed, frontend deployed to `constructor-hackathon.butterbase.dev`
- Neo4j Aura instance live, seeded, reachable from deployed Functions over HTTP Query API v2
- `get-graph`, `get-findings`, `get-jobs`, `get-artifact` — all real reads, tested live
- `trigger-scout` (old explicit/all-sources mode) — real Neo4j writes, tested live (16→32 nodes)
- `trigger-analyze` — real Neo4j write-back (`ExperimentRun`/`ResultArtifact`), tested live
- Daytona SDK connection + Pareto job script (`batch.ts`) — verified standalone (`npm run analyze:test`), **not yet reachable from the deployed function**

## What's mocked/fallback right now
- Analyze artifact content = local deterministic SVG/table generator, not a real Daytona sandbox run (RocketRide pipeline not deployed)
- Scout = one-shot batch, not the toggle/incremental design
- Right panel = single status card, not run history/trend

## What's not built at all
- RocketRide Cloud pipeline (organizer must-have — biggest open risk)
- Scout `{mode:'auto'}` + toggle UI
- `get-run-history` + right-panel run navigation/trend
- Planner agent

## If time runs out before rehearsal
Demo the fallback path as-is and say so out loud: "Scout batch-ingests today, will be incremental; Analyze produces a real graph write-back today with a deterministic chart while the RocketRide pipeline finishes deploying." Per CLAUDE.md: never claim a mocked/fallback piece is more than it is.
