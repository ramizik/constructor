import { type Artifact, type Env, cypher, err, ok, rows } from './_lib.ts';

// Returns a single ResultArtifact payload by id (stashed as JSON on the node).
interface Ctx {
  env: Env;
}

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const { ref } = (await req.json().catch(() => ({}))) as { ref?: string };
  if (!ref) return err('missing ref', 400);

  const res = await cypher(
    `MATCH (art:ResultArtifact {id: $ref}) RETURN art.payload AS payload`,
    { ref },
    ctx.env,
  );
  const payload = rows<{ payload: string }>(res)[0]?.payload;
  if (!payload) return err('not found', 404);
  return ok(JSON.parse(payload) as Artifact);
}
