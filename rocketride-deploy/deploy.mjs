import { RocketRideClient } from 'rocketride';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Minimal .env parser — avoids adding a dotenv dependency for a one-off script.
function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

const env = readEnv(join(repoRoot, '.env'));
const pipeline = JSON.parse(readFileSync(join(repoRoot, 'constructor-pipeline.pipe'), 'utf-8'));

const client = new RocketRideClient({
  auth: env.ROCKETRIDE_APIKEY,
  uri: env.ROCKETRIDE_URI,
});

console.log('Connecting to', env.ROCKETRIDE_URI, '...');
await client.connect();
console.log('Connected. Deploying pipeline (project_id:', pipeline.project_id, ')...');

const record = await client.deploy.add(pipeline, { schedule: 'manual' });
console.log(JSON.stringify(record, null, 2));

await client.disconnect();
process.exit(0);
