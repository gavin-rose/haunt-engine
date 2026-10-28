import { dialogueMessages, speak, type TalkContext } from "@/haunt/dialogue";
import { HauntBlueprint } from "@/haunt/schema";
import type { ChatMessage } from "@/llm/client";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    blueprint: unknown;
    characterId: string;
    history: ChatMessage[];
    context: TalkContext;
  };
  const bp = HauntBlueprint.safeParse(body.blueprint);
  if (!bp.success) return Response.json({ error: "bad blueprint" }, { status: 400 });
  const history = (body.history ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 400) }));

  const messages = dialogueMessages(bp.data, body.characterId, history, body.context ?? { inventory: [] });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0;
      try {
        await speak(messages, (text) => {
          controller.enqueue(encoder.encode(text.slice(sent)));
          sent = text.length;
        });
      } catch (e) {
        controller.enqueue(encoder.encode(`…(the voice fades: ${(e as Error).message})`));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
