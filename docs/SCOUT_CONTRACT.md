# Scout Write Contract (PROPOSAL — needs Track 1 + Track 4 sign-off)

**Owner:** Track 3 (Scout). **Sign-off needed from:** Track 1 (Graph/viz), Track 4 (Analyst/Daytona).
**Status:** DRAFT — lock in Phase 0, then nobody changes the numeric fields without pinging Track 4.

This defines the exact shape Scout writes to Neo4j so (a) the graph viz can render it immediately and (b) the Analyst's Daytona job can rank/plot on it without guessing at units or types. The two silent landmines this kills: `metric_value` typing and duplicate nodes on re-click.

---

## 0. Assumptions to confirm first (Track 2)

- **Scout runs inside a Butterbase Function (TS)** and writes to Neo4j directly via the Neo4j driver. It does NOT route through Daytona (only Analyst does).
- If Track 2 wants Scout as a separate Python service instead, the *graph shapes below don't change* — only the writer language does. So this contract is safe to lock regardless.

---

## 1. Nodes Scout creates

All nodes carry `id` (string, prefixed) and `created_at` (ISO-8601 string). Scout-created nodes also carry `run_id` so the frontend can highlight/animate the batch from a single Scout click.

| Node | Merge key (idempotency) | Fields |
|---|---|---|
| `Source` | `url` | `id="src_"+slug`, `url`, `title`, `type` (`"paper"`\|`"pasted"`), `created_at` |
| `Technique` | normalized `name` | `id="tech_"+slug`, `name`, `category` (optional), `created_at` |
| `Metric` | normalized `name` | `id="metric_"+slug`, `name`, `unit`, `higher_is_better` (bool), `created_at` |
| `Finding` | content hash (see §4) | `id="find_"+hash`, `text`, `value` (number\|null), `unit`, `metric_name`, `raw_text`, `run_id`, `created_at` |

**`Metric.higher_is_better`** is the polarity flag the Analyst needs for Pareto/ranking (maximize TOPS/W, minimize latency). Scout sets it per metric. Seed data must set it too.

**`Finding.value` is a `number` (or `null` if unparseable) — never a string like "~4 TOPS/W".** The raw human string goes in `raw_text`; `value`+`unit` are the machine-readable pair. This is the field the Analyst ranks on.

---

## 2. Relationships Scout creates

Using only the minimal relationship set (no new types beyond the agreed schema):

```
(:Finding)-[:EXTRACTED_FROM]->(:Source)          // provenance
(:Finding)-[:SUPPORTS]->(:Technique)             // evidence for a technique
(:Technique)-[:IMPROVES {value, unit}]->(:Metric)  // if higher_is_better matches gain
(:Technique)-[:HURTS   {value, unit}]->(:Metric)   // if it regresses the metric
```

The **`IMPROVES`/`HURTS` edge carries the numeric `value`** — this is what makes the Analyst query trivial (see §3). `IMPROVES` vs `HURTS` is chosen by Scout per measurement from `direction`.

**Keep the graph connected:** Scout MERGEs each `Technique` to the existing seed `ResearchGoal`:
```
(:Technique)-[:ADDRESSES]->(:ResearchGoal)
```
→ **Track 1: confirm the seed creates exactly one `ResearchGoal` and that `ADDRESSES` is acceptable.** Without this, Scout's output is a disconnected island next to the seed graph and looks broken on screen.

---

## 3. Analyst read query (Track 4 — this is your input contract)

The Analyst pulls its Daytona payload with one query. Example for a TOPS/W ranking:

```cypher
MATCH (t:Technique)-[r:IMPROVES]->(m:Metric {name: $metric})
RETURN t.id AS technique_id, t.name AS technique, r.value AS value, m.unit AS unit,
       m.higher_is_better AS higher_is_better
```

Daytona payload shape (JSON array):
```json
[
  {"technique_id":"tech_sparse-dataflow","technique":"Sparsity-aware dataflow",
   "value":4.2,"unit":"TOPS/W","higher_is_better":true},
  {"technique_id":"tech_mixed-precision","technique":"Mixed-precision quant",
   "value":3.1,"unit":"TOPS/W","higher_is_better":true}
]
```

**Track 4: if your job needs a second axis for a Pareto chart** (e.g. TOPS/W vs latency), say so now — Scout must then emit two `IMPROVES`/`HURTS` edges per technique (one per metric), and the query joins on two metrics. Decide **one job type (ranking OR Pareto)** before locking, per ROADMAP §4.

---

## 4. Idempotency (the "re-click Scout" problem)

- `Source`, `Technique`, `Metric` → **MERGE on natural key** (url / normalized name). Re-running never duplicates them.
- `Finding` → `id = "find_" + hash(source_url + technique_name + metric_name + value)`, MERGEd on that id. A second click on the **same source is a no-op** (no dupes); clicking Scout on a **different source adds new nodes** (the demo "wow"). MERGE edges too.
- Normalization for merge keys: `lower(trim(name))`, collapse internal whitespace. Agree this string rule with Track 1 so seed + Scout produce identical keys.

---

## 5. Extraction → write decoupling (Track 3 internal)

Extraction (regex now, LLM later) produces this intermediate object; a deterministic writer maps it to the Cypher above. This lets us swap regex↔Nebius without touching the graph-write code.

```json
{
  "source": {"url": "...", "title": "...", "type": "pasted"},
  "measurements": [
    {
      "technique": "Sparsity-aware dataflow",
      "metric": "TOPS/W",
      "value": 4.2,
      "unit": "TOPS/W",
      "direction": "improves",
      "raw_text": "…reports 4.2 TOPS/W at 2W…"
    }
  ]
}
```

---

## 6. Butterbase Function boundary (Track 2)

- **Input** (from Scout modal): `{ "sources": ["src_a"], "focus_hint": "prioritize thermal" }` — `sources` default = all; `focus_hint` optional, only used by LLM extraction.
- **Behavior:** write `jobs` row (`type:"scout"`, `status:"pending"`), return `{ "job_id": ... }` immediately, run extraction+write async, update row `running`→`done`/`error` with `result_ref` = summary (nodes/edges created counts + `run_id`).
- Frontend animates the new batch by filtering on the `run_id` returned in `result_ref`.

---

## Open questions to close in Phase 0 (assign an owner to each)

1. **[Track 2]** Scout = Butterbase Function (TS) or separate Python service? (§0)
2. **[Track 1]** One `ResearchGoal` in seed + is `ADDRESSES` OK? (§2)
3. **[Track 4]** One metric (ranking) or two metrics (Pareto)? Determines how many edges Scout emits. (§3)
4. **[Track 1+3]** Exact string-normalization rule for merge keys. (§4)
5. **[Track 1]** ID prefix convention — confirm seed uses same `src_`/`tech_`/`metric_` scheme so nothing collides.
6. **[Track 4]** Confirm `Finding.value` numeric + `Metric.higher_is_better` are sufficient for the job; flag any other field you need **now**, not at 2:00.
