"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RunResult } from "@/game/HauntScene";
import type { HauntBlueprint } from "@/haunt/schema";
import { drawCard } from "@/lib/card";
import { ensureSaved } from "@/lib/share";

const FALLBACK_EPITAPHS = [
  "Went in for one thing. Stayed for all of it.",
  "Brave, briefly.",
  "Should have brought a second candle.",
  "Heard the humming. Followed it anyway.",
];

export function EndScreen({
  result,
  blueprint,
  original,
  seed,
  hauntId,
  roomName,
  difficulty,
  sheet,
  onRetry,
  onExit,
}: {
  result: RunResult;
  blueprint: HauntBlueprint;
  /** as stored, before repair; the store keys haunts by it */
  original: HauntBlueprint;
  seed: string;
  hauntId?: string;
  roomName: string | null | undefined;
  difficulty: string;
  sheet?: HTMLCanvasElement;
  onRetry: () => void;
  onExit: () => void;
}) {
  const died = result.outcome === "died";
  const [carved, setCarved] = useState<string | null>(null);
  const epitaph = died ? carved : blueprint.win;
  const recorded = useRef(false);

  useEffect(() => {
    if (!died) return;
    let alive = true;
    const fallback = FALLBACK_EPITAPHS[result.seconds % FALLBACK_EPITAPHS.length];
    // a cold model can take a while; don't keep a grave waiting forever
    const timeout = setTimeout(() => alive && setCarved((c) => c ?? fallback), 12000);
    fetch("/api/epitaph", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: blueprint.title,
        setting: blueprint.setting,
        killer: result.killer,
        room: roomName,
        seconds: result.seconds,
        carrying: result.inventory.map((id) => blueprint.items.find((i) => i.id === id)?.name ?? id),
        unfinished: blueprint.objectives.find((o) => !result.objectivesDone.includes(o.id))?.text,
      }),
    })
      .then((r) => r.json())
      .then((d: { epitaph: string | null }) => alive && setCarved((c) => c ?? (d.epitaph || fallback)))
      .catch(() => alive && setCarved((c) => c ?? fallback));
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [died, result, blueprint, roomName]);

  useEffect(() => {
    if (!epitaph || recorded.current) return;
    recorded.current = true;
    void ensureSaved(original, seed, hauntId).then((id) => {
      if (!id) return;
      void fetch(`/api/haunts/${id}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "end",
          outcome: result.outcome,
          killer: result.killer,
          room: roomName ?? undefined,
          seconds: result.seconds,
          difficulty,
          epitaph: died ? epitaph : undefined,
          x: result.position.x,
          y: result.position.y,
        }),
      });
    });
  }, [epitaph, original, seed, hauntId, died, result, roomName, difficulty]);

  const cardUrl = useMemo(
    () =>
      epitaph
        ? drawCard({
            outcome: result.outcome,
            title: blueprint.title,
            epitaph,
            killer: result.killer,
            room: roomName,
            seconds: result.seconds,
            difficulty,
            sprite: sheet,
          }).toDataURL("image/png")
        : null,
    [epitaph, result, blueprint.title, roomName, difficulty, sheet],
  );

  return (
    <div className="rise absolute inset-0 flex items-center justify-center overflow-y-auto bg-ink/90 p-4">
      <div className="flex w-full max-w-4xl flex-col items-center gap-8 md:flex-row md:items-stretch">
        <div
          className={`relative flex w-[min(92vw,340px)] shrink-0 flex-col items-center px-7 pb-8 pt-14 text-center ${
            died ? "rounded-t-[140px] border border-paper/15 bg-[#29262a]" : "card"
          }`}
        >
          <p className="label">{died ? "here lies" : "you got out"}</p>
          <p className="mt-2 font-serif text-4xl">{died ? "a Visitor" : "Alive"}</p>
          <div className="mx-auto my-4 h-px w-20 bg-paper/25" />
          <p className="min-h-16 font-serif text-xl italic leading-snug text-paper/90">
            {epitaph ?? <span className="waiting text-paper/40">the stonemason is carving</span>}
          </p>
          <p className="mt-4 font-serif text-sm text-paper/50">
            {died ? (
              <>
                Taken by {result.killer}
                {roomName ? ` in the ${roomName}` : ""}.{" "}
              </>
            ) : null}
            {result.seconds}s · {difficulty}
          </p>
          <div className="mt-auto flex gap-3 pt-7">
            <button onClick={onRetry} className="btn">
              {died ? "Rise again" : "Go back in"}
            </button>
            <button onClick={onExit} className="btn border-paper/15 text-paper/60">
              {died ? "Rest" : "Leave"}
            </button>
          </div>
        </div>

        <div className="card flex w-[min(92vw,520px)] flex-col gap-4 p-6">
          <p className="label">{died ? "your grave" : "your escape"}</p>
          <div className="aspect-[1200/630] w-full overflow-hidden border border-paper/10 bg-black/40">
            {cardUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cardUrl} alt="Your grave card" className="h-full w-full object-cover" />
            )}
          </div>
          <p className="font-serif text-sm text-paper/50">
            {died ? "Your headstone stays here. Next time you come through, you'll pass it." : "The haunt remembers you got out."}
          </p>
          <div>
            {cardUrl && (
              <a href={cardUrl} download={died ? "my-grave.png" : "i-got-out.png"} className="btn btn-solid inline-block text-sm">
                Save card
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
