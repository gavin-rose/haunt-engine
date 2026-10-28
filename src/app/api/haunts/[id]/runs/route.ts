import { z } from "zod";
import { recordEntry, recordRun } from "@/server/store";

const Run = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enter") }),
  z.object({
    kind: z.literal("end"),
    outcome: z.enum(["died", "escaped"]),
    killer: z.string().max(80).optional(),
    room: z.string().max(80).optional(),
    seconds: z.number().int().min(0).max(86400),
    difficulty: z.string().max(20),
    epitaph: z.string().max(200).optional(),
    x: z.number().int().min(0).max(1000),
    y: z.number().int().min(0).max(1000),
  }),
]);

export async function POST(req: Request, ctx: RouteContext<"/api/haunts/[id]/runs">) {
  const { id } = await ctx.params;
  const parsed = Run.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "bad run" }, { status: 400 });
  const run = parsed.data;
  if (run.kind === "enter") {
    await recordEntry(id);
    return Response.json({ ok: true });
  }
  const grave = await recordRun({
    hauntId: id,
    outcome: run.outcome,
    killer: run.killer,
    room: run.room,
    seconds: run.seconds,
    difficulty: run.difficulty,
    epitaph: run.epitaph,
    x: run.x,
    y: run.y,
  });
  if (!grave) return Response.json({ error: "no such haunt" }, { status: 404 });
  return Response.json({ ok: true });
}
