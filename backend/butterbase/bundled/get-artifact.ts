// Returns a single ResultArtifact by id. Handles both shapes:
//   - trigger-analyze writes `payload` (full artifact JSON) → return as-is
//   - the seed / Track 4 convention writes `kind` + `ref` (e.g. a chart image
//     path) with no payload → build a ChartArtifact pointing image_url at `ref`
interface Ctx {
  env: Env;
  db: any;
}

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const { ref } = (await req.json().catch(() => ({}))) as { ref?: string };
  if (!ref) return err('missing ref', 400);

  const res = await cypher(
    `MATCH (art:ResultArtifact {id: $ref})
     RETURN art.payload AS payload, art.kind AS kind, art.title AS title,
            art.ref AS ref, art.takeaway AS takeaway`,
    { ref },
    ctx.env,
  );
  const r = rows<{
    payload?: string;
    kind?: string;
    title?: string;
    ref?: string;
    takeaway?: string;
  }>(res)[0];
  if (!r) return err('not found', 404);

  if (r.payload) return ok(JSON.parse(r.payload) as Artifact);

  // Fallback: reconstruct from node props (seed / Track 4 shape).
  if (r.kind === 'chart') {
    return ok({
      kind: 'chart',
      title: r.title ?? 'Result',
      image_url: r.ref ?? '',
      takeaway: r.takeaway,
    } satisfies Artifact);
  }
  return ok({ kind: 'table', title: r.title ?? 'Result', columns: [], rows: [] } satisfies Artifact);
}
