import { chat } from "@/llm/client";

export async function POST(req: Request) {
  const b = (await req.json()) as {
    title?: string;
    setting?: string;
    killer?: string;
    room?: string;
    seconds?: number;
    carrying?: string[];
    unfinished?: string;
  };
  const facts = [
    `Place: ${b.title} (${b.setting})`,
    `Killed by: ${b.killer}`,
    b.room && `Died in: ${b.room}`,
    `Lasted: ${b.seconds} seconds`,
    b.carrying?.length ? `Was carrying: ${b.carrying.join(", ")}` : "Was carrying nothing",
    b.unfinished && `Never managed to: ${b.unfinished}`,
  ]
    .filter(Boolean)
    .map((s) => String(s).slice(0, 160))
    .join("\n");
  try {
    const text = await chat(
      [
        {
          role: "system",
          content:
            "You carve epitaphs for a haunted-house game. Write ONE epitaph for the visitor who just died: at most 14 words, wry and a little tender, built on one concrete detail from the facts. Never restate the facts plainly. Address the dead as 'you' or use no pronoun at all. No quotes, no hashtags, no 'RIP', no 'here lies'.\n\nThe tone, from other graves (match the tone; never reuse their words):\nCame for the yearbook. Stayed for homeroom, forever.\nAlmost had the key. The door was patient.\nRead every label in the dark except the last one.\nIt hummed. You hummed back.",
        },
        { role: "user", content: facts },
      ],
      { temperature: 1, maxTokens: 60, model: process.env.LLM_DIALOGUE_MODEL },
    );
    const epitaph = text.trim().split("\n")[0].replace(/^["“'*]+|["”'*]+$/g, "").slice(0, 160);
    return Response.json({ epitaph: epitaph || null });
  } catch {
    return Response.json({ epitaph: null });
  }
}
