import "dotenv/config";
import neo4j, { type Driver } from "neo4j-driver";

const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE } = process.env;

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  throw new Error("NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD must be set in backend/.env");
}

export const driver: Driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

export function getSession() {
  return driver.session({ database: NEO4J_DATABASE });
}
