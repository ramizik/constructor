// Wipes the graph and reloads /graph/schema.cypher. Deterministic — safe to
// re-run before rehearsal or the live demo if Scout/Analyst testing has
// left junk in the graph.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { driver, getSession } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "../../../graph/schema.cypher");

async function main() {
  const session = getSession();
  try {
    await session.run("MATCH (n) DETACH DELETE n");

    const cypher = readFileSync(schemaPath, "utf8");
    await session.run(cypher);

    const result = await session.run(
      "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS c ORDER BY label"
    );
    console.log("Seeded. Node counts by label:");
    for (const record of result.records) {
      console.log(" -", record.get("label"), ":", record.get("c").toNumber());
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
