"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { HauntBlueprint } from "@/haunt/schema";
import stAgnes from "@/haunt/demos/st-agnes.json";
import { Procession } from "@/components/Procession";
import { DIFFICULTIES } from "@/game/difficulty";
import { usePref } from "@/lib/prefs";

const GameView = dynamic(() => import("@/components/GameView").then((m) => m.GameView), { ssr: false });

const EXAMPLES = [
  "my grandmother's kitchen, the night before Día de los Muertos",
  "a cozy bakery",
  "a roller rink birthday party, 1994",
  "the last video rental store on earth",
];
const EXPECTED_CHARS = 5500;

type State =
  | { at: "menu"; error?: string }
  | { at: "summoning"; prompt: string; chars: number }
  | { at: "playing"; blueprint: HauntBlueprint; seed: string; hauntId?: string };

export default function Home() {
  const [state, setState] = useState<State>({ at: "menu" });
  const [prompt, setPrompt] = useState("");

  async function summon(text: string) {
    setState({ at: "summoning", prompt: text, chars: 0 });
    try {
      const res = await fetch("/api/haunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const msg = JSON.parse(line);
          if (msg.type === "progress") setState({ at: "summoning", prompt: text, chars: msg.chars });
          if (msg.type === "error") return setState({ at: "menu", error: msg.error });
          if (msg.type === "done") {
            history.replaceState(null, "", `/s/${msg.id}`);
            return setState({ at: "playing", blueprint: msg.blueprint, seed: msg.seed, hauntId: msg.id });
          }
        }
      }
      setState({ at: "menu", error: "The connection went cold." });
    } catch (e) {
      setState({ at: "menu", error: (e as Error).message });
    }
  }

  if (state.at === "playing")
    return (
      <GameView
        blueprint={state.blueprint}
        seed={state.seed}
        hauntId={state.hauntId}
        onExit={() => {
          history.replaceState(null, "", "/");
          setState({ at: "menu" });
        }}
      />
    );

  if (state.at === "summoning")
    return (
      <main className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-4 text-center">
        <p className="label">the architect is drawing the plans</p>
        <p className="max-w-xl font-serif text-3xl italic leading-snug">“{state.prompt}”</p>
        <div className="h-px w-64 bg-paper/10">
          <div className="h-full bg-paper/70 transition-all duration-700" style={{ width: `${Math.min(97, (state.chars / EXPECTED_CHARS) * 100)}%` }} />
        </div>
        <p className="waiting font-serif text-sm text-paper/40">this takes a minute</p>
        <Procession />
      </main>
    );

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 pb-40 pt-12">
      <div className="relative w-full max-w-xl">
        <h1 className="font-serif text-5xl leading-none">Haunt Engine</h1>
        <p className="mt-3 font-serif text-lg italic text-paper/60">Describe a place. Walk through what&rsquo;s waiting in it.</p>

        <form
          className="mt-8 flex items-end gap-3 border-b border-paper/25 pb-2 focus-within:border-paper/60"
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt.trim()) void summon(prompt.trim());
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={500}
            placeholder="the classroom where my grandmother taught"
            className="min-w-0 flex-1 bg-transparent font-serif text-2xl outline-none placeholder:text-paper/25"
          />
          <button type="submit" disabled={!prompt.trim()} className="btn btn-solid shrink-0">
            Summon
          </button>
        </form>
        {state.error && <p className="mt-2 font-serif text-[#d9776e]">{state.error}</p>}

        <p className="mt-3 font-serif text-sm leading-relaxed text-paper/45">
          or try{" "}
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              <button type="button" onClick={() => setPrompt(ex)} className="link text-paper/65 hover:text-paper">
                {ex}
              </button>
              {i < EXAMPLES.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>

        <DifficultyPicker />
        <YourHaunts />

        <div className="mt-10 flex items-baseline justify-between border-t border-paper/10 pt-4 font-serif">
          <button
            type="button"
            onClick={() => setState({ at: "playing", blueprint: stAgnes as HauntBlueprint, seed: "agnes" })}
            className="link text-paper/80 hover:text-paper"
          >
            Enter St. Agnes Elementary
          </button>
          <Link href="/credits" className="link text-sm text-paper/45 hover:text-paper">
            Credits
          </Link>
        </div>
      </div>
      <Procession />
    </main>
  );
}

type HauntSummary = { id: string; title: string; prompt?: string; entered: number; died: number; escaped: number };

function YourHaunts() {
  const [haunts, setHaunts] = useState<HauntSummary[]>([]);
  useEffect(() => {
    fetch("/api/haunts")
      .then((r) => r.json())
      .then(setHaunts)
      .catch(() => {});
  }, []);
  if (!haunts.length) return null;
  return (
    <div className="mt-8">
      <p className="label">your haunts</p>
      <ul className="mt-2 divide-y divide-paper/10 border-y border-paper/10">
        {haunts.slice(0, 5).map((h) => (
          <li key={h.id}>
            <Link href={`/s/${h.id}`} className="group flex items-baseline justify-between gap-4 py-2 font-serif">
              <span className="truncate text-paper/80 group-hover:text-paper">{h.title}</span>
              <span className="shrink-0 text-sm text-paper/40">
                {h.entered === 0 ? "not yet entered" : `${h.died} died · ${h.escaped} got out`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DifficultyPicker() {
  const [value, setValue] = usePref("haunt:difficulty", "visitor");
  const current = DIFFICULTIES.find((d) => d.id === value) ?? DIFFICULTIES[1];
  return (
    <div className="mt-8">
      <div role="radiogroup" aria-label="Difficulty" className="flex items-baseline gap-5">
        <span className="label">difficulty</span>
        {DIFFICULTIES.map((d) => {
          const on = d.id === value;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setValue(d.id)}
              className={`font-sc tracking-wider transition ${on ? "text-paper underline decoration-oxblood decoration-2 underline-offset-[6px]" : "text-paper/40 hover:text-paper/70"}`}
            >
              {d.name}
            </button>
          );
        })}
      </div>
      <p className="mt-2 font-serif text-sm italic text-paper/45">{current.blurb}</p>
    </div>
  );
}
