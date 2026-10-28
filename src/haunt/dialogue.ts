import { chat, type ChatMessage } from "@/llm/client";
import type { HauntBlueprint } from "./schema";

export type TalkContext = {
  inventory: string[];
  currentObjective?: string;
};

export function dialogueMessages(
  bp: HauntBlueprint,
  characterId: string,
  history: ChatMessage[],
  ctx: TalkContext,
): ChatMessage[] {
  const c = bp.cast.find((k) => k.id === characterId);
  if (!c) throw new Error(`unknown character ${characterId}`);
  const others = bp.cast.filter((k) => k.id !== c.id).map((k) => `${k.name} (${k.role})`);
  const items = ctx.inventory.map((id) => bp.items.find((i) => i.id === id)?.name ?? id);

  const system = `You are ${c.name}, ${c.role}, in "${bp.title}": ${bp.setting}.
${c.kind === "ghost" ? "You are dead. You may or may not know it." : c.kind === "shadow" ? "You are barely a person anymore." : ""}
Persona: ${c.persona}
What happened here: ${bp.premise}
Others in this place: ${others.join("; ") || "no one"}.
The visitor is carrying: ${items.join(", ") || "nothing"}.
${ctx.currentObjective ? `The visitor is trying to: ${ctx.currentObjective}. If it fits who you are, nudge them toward it, obliquely,, the way a ghost would.` : ""}

Speak only as ${c.name}. One to three short sentences. No stage directions, no asterisks, no narration. Never mention being an AI, a game or a character. Keep it eerie, specific, a little sad.`;

  return [{ role: "system", content: system }, ...history.slice(-12)];
}

export function speak(messages: ChatMessage[], onProgress: (text: string) => void) {
  return chat(messages, { temperature: 0.9, maxTokens: 160, onProgress, model: process.env.LLM_DIALOGUE_MODEL });
}
