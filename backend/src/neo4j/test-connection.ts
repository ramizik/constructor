import { driver, getSession } from "./client.js";

async function main() {
  await driver.verifyConnectivity();
  console.log("Connected to Neo4j.");

  const session = getSession();
  try {
    const result = await session.run("MATCH (n) RETURN count(n) AS c");
    console.log("Node count:", result.records[0].get("c").toNumber());
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
