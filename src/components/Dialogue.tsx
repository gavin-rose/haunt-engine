"use client";

import { useEffect, useRef, useState } from "react";
import type { Character, HauntBlueprint } from "@/haunt/schema";
import type { ChatMessage } from "@/llm/client";

const histories = new Map<string, ChatMessage[]>();
const OPENER = "(You stand in front of them, saying nothing.)";

export function Dialogue({
  blueprint,
  character,
  portrait,
  inventory,
  objective,
  onClose,
}: {
  blueprint: HauntBlueprint;
  character: Character;
  portrait?: string;
  inventory: string[];
  objective?: string;
  onClose: () => void;
}) {
  const key = `${blueprint.title}:${character.id}`;
  const [history, setHistory] = useState<ChatMessage[]>(() => histories.get(key) ?? []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  async function say(text: string) {
    const next: ChatMessage[] = [...history, { role: "user", content: text }];
    setHistory([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    const res = await fetch("/api/talk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprint, characterId: character.id, history: next, context: { inventory, currentObjective: objective } }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let reply = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      reply += decoder.decode(value, { stream: true });
      setHistory([...next, { role: "assistant", content: reply }]);
    }
    const final: ChatMessage[] = [...next, { role: "assistant", content: reply.trim() }];
    histories.set(key, final);
    setHistory(final);
    setBusy(false);
    input.current?.focus();
  }

  useEffect(() => {
    // they speak first (deferred so StrictMode's double-mount doesn't greet twice)
    const greet = history.length === 0 ? setTimeout(() => void say(OPENER), 0) : undefined;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(greet);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [history]);

  const ghostly = character.kind === "ghost" ? "opacity-80 [filter:sepia(0.2)_hue-rotate(180deg)_saturate(0.6)_brightness(1.15)]" : character.kind === "shadow" ? "brightness-0" : "";
  return (
    <div className="rise absolute inset-x-0 bottom-0 flex justify-center p-4">
      <div className="card flex w-[min(96vw,760px)] gap-5 p-5">
        <div className="hidden shrink-0 sm:block">
          <div className="relative h-32 w-28 overflow-hidden border border-paper/20 bg-[#15171c]">
            {portrait && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portrait} alt="" className={`pixelated absolute -bottom-3 left-1/2 w-32 max-w-none -translate-x-1/2 ${ghostly}`} />
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <span className={`font-sc text-xl tracking-wider ${character.kind === "ghost" ? "text-moon" : "text-paper"}`}>{character.name}</span>
              <span className="ml-3 font-serif text-sm italic text-paper/45">{character.role}</span>
            </div>
            <button onClick={onClose} className="shrink-0 font-sc text-sm tracking-wider text-paper/45 hover:text-paper">
              Walk away (esc)
            </button>
          </div>
          <div ref={scroller} className="mt-2 max-h-56 min-h-20 space-y-2 overflow-y-auto pr-2">
            {history
              .filter((m) => m.content !== OPENER)
              .map((m, i) => (
                <p key={i} className={m.role === "assistant" ? "font-serif text-lg leading-snug text-paper" : "font-serif text-base italic text-paper/50"}>
                  {m.role === "assistant" ? m.content || "…" : `“${m.content}”`}
                </p>
              ))}
          </div>
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim() || busy) return;
              void say(draft.trim());
              setDraft("");
            }}
          >
            <input
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={300}
              placeholder={busy ? "they are speaking…" : "say something, then press enter"}
              className="w-full border-b border-paper/20 bg-transparent py-1.5 font-serif text-base text-paper outline-none placeholder:text-paper/30 focus:border-paper/60"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
