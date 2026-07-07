# Phase 0 Decisions — Scout Contract Open Questions (LOCKED)

Resolves the 6 open questions in [SCOUT_CONTRACT.md](./SCOUT_CONTRACT.md). These are the defaults we build against. Changing a numeric-contract item (Q3, Q6) after Phase 0 requires pinging Track 4 in the channel first.

Decision criteria (from CLAUDE.md): faster to demo → easier to explain → more visually impressive → less likely to break.

---

## Q1 — How does Scout run? → **Butterbase Function (TypeScript), writes Neo4j directly**
**[Owner: Track 2 + Track 3]**

Scout logic lives in a Butterbase Function in TS and talks to Neo4j via the JS driver. No separate Python service, no routing through Daytona (Daytona is Analyst-only).

*Why:* one less piece of infra to stand up and wire; the extraction we need in Phase 1 (regex, optional LLM call) is trivial in TS; keeps all agent trigger endpoints in one Butterbase surface for Track 2. The graph shapes in the contract don't depend on this, so it's a zero-risk lock.

---

## Q2 — Seed `ResearchGoal` + `ADDRESSES` edge? → **Yes. One `ResearchGoal`, Scout links via `ADDRESSES`**
**[Owner: Track 1]**

Seed creates exactly **one** `ResearchGoal` node (the hardcoded goal string). Every `Technique` Scout writes gets `(:Technique)-[:ADDRESSES]->(:ResearchGoal)`.

*Why:* keeps Scout's output connected to the seed graph instead of spawning a disconnected island that reads as "broken" on screen. `ADDRESSES` is one extra relationship type, justified because connectedness is a live-demo requirement.

---

## Q3 — One metric (ranking) or two (Pareto)? → **Two metrics → Pareto chart, with ranking as built-in fallback**
**[Owner: Track 4 + Track 3]**

The Daytona job is a **Pareto scatter** over two axes:
- **`TOPS/W`** — efficiency, `higher_is_better = true` (maximize)
- **`Memory_MB`** — on-chip memory footprint, `higher_is_better = false` (minimize)

Scout emits **two** `IMPROVES`/`HURTS` edges per technique (one per metric). The job plots each technique as a point and highlights the Pareto frontier.

*Why:* a chart with a highlighted frontier is dramatically more demo-impressive than a table, and "these 2 techniques dominate the efficiency/memory tradeoff" is the exact one-line takeaway the demo closes on. It fits the stated domain (thermal **and memory** constraints). Risk is controlled because sources are **fixed and pre-picked** — we choose text that contains both numbers per technique, so extraction can't come up short by surprise.

**Fallback (decide by the 2:00 checkpoint):** if two clean numeric axes per technique aren't reliably landing, drop `Memory_MB` and ship the **single-metric ranking table on `TOPS/W`**. Zero Scout rework — ranking is a strict subset of the same data. Do not debug past 2:00; degrade.

---

## Q4 — Merge-key normalization rule → **`lower` → `trim` → collapse whitespace → strip trailing punctuation**
**[Owner: Track 1 + Track 3]**

Applied to `Technique.name` and `Metric.name` before forming the merge key:
1. lowercase
2. trim leading/trailing whitespace
3. collapse internal runs of whitespace to a single space
4. strip trailing `. , ; :`

Example: `"  Sparsity-Aware  Dataflow. "` → `"sparsity-aware dataflow"`.

Seed data and Scout **both** apply this identical rule, so a technique named in the seed and re-mentioned by Scout MERGE to one node instead of forking.

---

## Q5 — ID prefix convention → **`<type>_` prefix + slug of the natural key**
**[Owner: Track 1]**

Seed, Scout, and Analyst all use:

| Prefix | Node | Basis |
|---|---|---|
| `goal_` | ResearchGoal | fixed (`goal_main`) |
| `src_` | Source | slug(url) |
| `tech_` | Technique | slug(normalized name) |
| `metric_` | Metric | slug(normalized name) |
| `find_` | Finding | content hash (see contract §4) |
| `run_` | Scout batch run_id | uuid |
| `exp_` | ExperimentRun (Analyst) | uuid |
| `artifact_` | ResultArtifact (Analyst) | uuid |

**slug():** apply the Q4 normalization, then replace every non-`[a-z0-9]` run with a single `-`, strip leading/trailing `-`. Example: `"TOPS/W"` → `tops-w`.

---

## Q6 — Are `Finding.value` (number) + `Metric.higher_is_better` enough for the job? → **Yes, with the two metrics named in Q3**
**[Owner: Track 4]**

Confirmed sufficient. The Analyst's Pareto payload per technique is:
```json
{"technique_id":"tech_...","technique":"...",
 "tops_w":4.2, "memory_mb":1.5, "higher_is_better":{"tops_w":true,"memory_mb":false}}
```
Built from `(t:Technique)-[r:IMPROVES|HURTS]->(m:Metric)` where `m.name IN ["TOPS/W","Memory_MB"]`, pivoting the two edges into two columns. No new node fields required. If Track 4 needs anything beyond this, raise it **now** — not at 2:00.

---

## Net effect on Scout's build

Per technique, Scout must extract **two** measurements (`TOPS/W` and `Memory_MB`) from each fixed source and write, per contract:
- MERGE `Source`, `Technique`, two `Metric` nodes
- CREATE `Finding` per measurement (content-hash id)
- `Finding-[:EXTRACTED_FROM]->Source`, `Finding-[:SUPPORTS]->Technique`
- `Technique-[:IMPROVES]->(:Metric TOPS/W)` and `Technique-[:HURTS]->(:Metric Memory_MB)` (direction per metric polarity)
- `Technique-[:ADDRESSES]->ResearchGoal`

Next Scout step: pick the 2–3 fixed sources and confirm each contains both a TOPS/W and a memory figure per technique.
