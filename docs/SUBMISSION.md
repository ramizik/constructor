## Constructor

Hardware researchers evaluating edge-AI accelerator techniques drown in scattered papers, spreadsheets, and one-off scripts — there's no single place where a claim becomes a tracked technique, a technique becomes a measured tradeoff, and a tradeoff becomes a real experiment. Constructor is that place: an autonomous research assistant that scouts sources, runs real experiments, and grows a live knowledge graph on its own. Set the goal — *"find promising techniques for improving TOPS/W under thermal and memory constraints for edge inference accelerators"* — and watch agents do the rest.

**What makes it different:** most agent demos show a chatbot bolted onto a UI. Constructor's agents write to a real graph and trigger real computation — every claim a Scout ingests becomes a persistent node, and every Analyze run spins up isolated sandboxes that actually simulate the technique's tradeoffs, not a canned chart. Nothing on screen is theater: the graph you watch grow is the same graph the next analysis reads from, and every run is kept as history instead of overwriting the last, so you can watch the frontier shift as evidence accumulates.

**How we used the stack:**
- **Neo4j** is the memory — techniques, metrics, findings, sources, and experiment runs live as a real graph, not app state. Every Scout tick and every Analyze run is a Cypher write, so the graph is the single source of truth the whole app reads from.
- **Butterbase** is the backbone — serverless functions handle every read/write between the frontend and Neo4j, track job state, and host the deployed app, with zero custom server infra to babysit.
- **Daytona** is where the real work happens — each technique gets its own isolated sandbox running a genuine Monte-Carlo simulation over its measured tradeoffs, then the sandbox is torn down. This is actual computation, not a lookup table.
- **RocketRide** is the orchestrator — it's the pipeline that sits between Scout and Analyst, re-freshens the graph, drives the Daytona job, and hands the result back for Neo4j to absorb. It's what turns "click a button" into a real multi-step agent pipeline instead of one function calling another.

The result: click Scout, watch the graph grow node by node from real sources. Click Analyze, watch isolated sandboxes actually compute a Pareto frontier and write it back as a new, permanent experiment. No mocked charts, no forgotten history — just a graph that gets smarter every time you use it.
