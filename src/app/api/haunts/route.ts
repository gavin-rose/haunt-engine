import { HauntBlueprint } from "@/haunt/schema";
import { listHaunts, saveHaunt } from "@/server/store";

export async function GET() {
  return Response.json(await listHaunts());
}

// Save a haunt (the demo, or anything played before it was stored) so its graves are kept.
export async function POST(req: Request) {
  const body = (await req.json()) as { blueprint?: unknown; seed?: unknown };
  const bp = HauntBlueprint.safeParse(body.blueprint);
  if (!bp.success || typeof body.seed !== "string" || body.seed.length > 40) {
    return Response.json({ error: "bad haunt" }, { status: 400 });
  }
  const id = await saveHaunt(bp.data, body.seed);
  return Response.json({ id });
}
