import { daytona } from "./client.js";

async function main() {
  console.log("Creating sandbox...");
  const sandbox = await daytona.create({ language: "python" });

  try {
    console.log(`Sandbox ${sandbox.id} started, running test code...`);
    const response = await sandbox.process.codeRun(
      "print(2 + 2)\nprint('daytona connection ok')",
    );
    console.log("Result:", response.result);
  } finally {
    console.log("Cleaning up sandbox...");
    await daytona.delete(sandbox);
  }
}

main()
  .then(() => console.log("Daytona integration confirmed."))
  .catch((err) => {
    console.error("Daytona connection test failed:", err);
    process.exit(1);
  });
