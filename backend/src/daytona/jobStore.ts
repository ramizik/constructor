import type { JobStatus } from "./types.js";

// Stub until Track 2 wires the real Butterbase `jobs` table + realtime.
// Swap the body for a Butterbase update_row call — signature stays the same.
export async function updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
  console.log(`[job ${jobId}] status -> ${status}`);
}
