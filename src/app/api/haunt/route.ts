import { designHaunt } from "@/haunt/architect";
import type { HauntBlueprint } from "@/haunt/schema";
import { hauntForPrompt, normalizePrompt, saveHaunt } from "@/server/store";

// Summon a haunt. Streams NDJSON: {type:"progress", chars} while the model writes, then
// {type:"done", id, blueprint, seed}. Blueprints are saved as soon as they exist, and a prompt
// that was already summoned returns the stored haunt without touching the model.

/** identical prompts in flight share one generation */
const inflight = new Map<string, Promise<{ id: string; blueprint: HauntBlueprint; seed: string }>>();

export async function POST(req: Request) {
  const { prompt: raw } = (await req.json()) as { prompt?: string };
  const prompt = raw?.trim() ?? "";
  if (!prompt || prompt.length > 500) return Response.json({ error: "prompt must be 1-500 chars" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // if the visitor leaves mid-summon, keep generating anyway: it's paid for, so it gets saved
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {}
      };
      try {
        const cached = await hauntForPrompt(prompt);
        if (cached) {
          send({ type: "done", id: cached.id, blueprint: cached.blueprint, seed: cached.seed, cached: true });
          return;
        }
        const key = normalizePrompt(prompt);
        let job = inflight.get(key);
        if (!job) {
          let lastSent = 0;
          job = designHaunt(prompt, (text) => {
            if (text.length - lastSent < 40) return;
            lastSent = text.length;
            send({ type: "progress", chars: text.length });
          }).then(async (blueprint) => {
            const seed = crypto.randomUUID().slice(0, 8);
            return { id: await saveHaunt(blueprint, seed, prompt), blueprint, seed };
          });
          inflight.set(key, job);
          job.finally(() => inflight.delete(key)).catch(() => {});
        }
        send({ type: "done", ...(await job) });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
}
