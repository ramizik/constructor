// Job/task list from Postgres, newest first.
interface Ctx {
  env: Env;
  db: any;
}

export default async function handler(_req: Request, ctx: Ctx): Promise<Response> {
  const jobs = await jobsList(ctx.db);
  return ok(jobs);
}
