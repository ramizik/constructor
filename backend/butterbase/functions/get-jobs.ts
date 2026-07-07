import { type Env, type Job, bbGet, ok } from './_lib.ts';

// Job/task list from Postgres via Butterbase auto-REST, newest first.
interface Ctx {
  env: Env;
}

export default async function handler(_req: Request, ctx: Ctx): Promise<Response> {
  const jobs = await bbGet<Job[]>('/jobs?order=created_at.desc&limit=50', ctx.env);
  return ok(jobs);
}
