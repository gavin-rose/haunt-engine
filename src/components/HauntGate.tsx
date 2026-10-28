"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HauntBlueprint } from "@/haunt/schema";
import type { GraveMark } from "@/game/HauntScene";

const GameView = dynamic(() => import("@/components/GameView").then((m) => m.GameView), { ssr: false });

export type GateStats = { entered: number; died: number; escaped: number };
export type GateGrave = GraveMark & { seconds: number; killer?: string; difficulty: string };

export function HauntGate({
  blueprint,
  seed,
  hauntId,
  stats,
  graves = [],
}: {
  blueprint: HauntBlueprint;
  seed: string;
  hauntId?: string;
  stats?: GateStats;
  graves?: GateGrave[];
}) {
  const router = useRouter();
  const [entered, setEntered] = useState(false);
  if (entered)
    return <GameView blueprint={blueprint} seed={seed} hauntId={hauntId} graves={graves} onExit={() => router.push("/")} />;

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-4 py-16 text-center">
      <p className="label">{stats && stats.entered > 0 ? "you have been here before" : "it is waiting"}</p>
      <h1 className="max-w-2xl font-serif text-5xl leading-tight sm:text-6xl">{blueprint.title}</h1>
      <p className="max-w-xl font-serif text-xl italic leading-snug text-paper/70">{blueprint.premise}</p>
      {stats && stats.entered > 0 && (
        <p className="font-sc tracking-wider text-paper/55">
          {stats.entered} {stats.entered === 1 ? "visit" : "visits"} · <span className="text-[#d9776e]">{stats.died} died</span> · {stats.escaped} got out
        </p>
      )}
      <button onClick={() => setEntered(true)} className="btn btn-solid mt-2 px-8 py-2 text-lg">
        Enter
      </button>
      {graves.some((g) => g.epitaph) && (
        <section className="mt-8 w-full max-w-2xl">
          <p className="label mb-4">your graves</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {graves
              .filter((g) => g.epitaph)
              .slice(0, 6)
              .map((g, i) => (
                <li key={i} className="rounded-t-[56px] border border-paper/12 bg-[#211f22] px-5 pb-4 pt-6">
                  <p className="font-serif text-base italic leading-snug text-paper/85">{g.epitaph}</p>
                  <p className="mt-2 font-serif text-xs text-paper/40">
                    {g.killer ? `taken by ${g.killer}` : "lost"} · {g.seconds}s · {g.difficulty}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      )}
      <Link href="/" className="link mt-2 font-serif text-sm text-paper/45 hover:text-paper">
        back to the start
      </Link>
    </main>
  );
}
