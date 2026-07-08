import { type Artifact, type Env, cypher, err, ok, rows } from './_lib.ts';

// Returns a single ResultArtifact by id. trigger-analyze always writes the
// full artifact as `payload` JSON — anything else means the write path is
// broken or the id is wrong, so this errors instead of guessing a shape.
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
  const r = rows<{ payload?: string }>(res)[0];
  if (!r) return err('not found', 404);
  if (!r.payload) return err(`artifact ${ref} has no payload`, 500);

  return ok(JSON.parse(r.payload) as Artifact);
}
