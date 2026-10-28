"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Bridge, GraveMark, HauntScene, ObjectiveState, RunResult, Sheets } from "@/game/HauntScene";
import { HauntAudio } from "@/game/audio";
import { difficultyById } from "@/game/difficulty";
import { DEFAULT_PLAYER, type Appearance } from "@/game/look";
import { usePref } from "@/lib/prefs";
import { EndScreen } from "./EndScreen";
import { generateMap } from "@/haunt/generate";
import { repairBlueprint } from "@/haunt/repair";
import type { HauntBlueprint } from "@/haunt/schema";
import { Dialogue } from "./Dialogue";

type Message = { id: number; text: string; tone: string };

const TONE: Record<string, string> = {
  warn: "text-[#d9776e]",
  pickup: "text-gilt",
  event: "text-moon",
  mood: "text-paper",
};

function portrait(walk: HTMLCanvasElement): string {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  c.getContext("2d")!.drawImage(walk, 0, 128, 64, 64, 0, 0, 64, 64);
  return c.toDataURL();
}

export function GameView({
  blueprint,
  seed,
  hauntId,
  graves = [],
  onExit,
}: {
  blueprint: HauntBlueprint;
  seed: string;
  /** set when playing a stored haunt; otherwise it's stored when the run ends */
  hauntId?: string;
  graves?: GraveMark[];
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<HauntScene | null>(null);
  const [runId, setRunId] = useState(0);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveState[]>([]);
  const [inventory, setInventory] = useState<{ id: string; name: string }[]>([]);
  const [talking, setTalking] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [lives, setLives] = useState(0);
  const [difficultyId] = usePref("haunt:difficulty", "visitor");
  const [muted, setMuted] = usePref("haunt:muted", "0");
  const difficulty = difficultyById(difficultyId);
  const audio = useRef<HauntAudio | null>(null);
  const [playerSheet, setPlayerSheet] = useState<Sheets[string] | null>(null);

  // audio can only start after a gesture; M toggles it
  useEffect(() => {
    const a = new HauntAudio();
    audio.current = a;
    const wake = () => a.start();
    const onKey = (e: KeyboardEvent) => {
      wake();
      if (e.key === "m" && !(e.target instanceof HTMLInputElement)) setMuted(a.muted ? "0" : "1");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", wake);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", wake);
      a.stop();
    };
  }, [setMuted]);
  useEffect(() => {
    audio.current?.setMuted(muted === "1");
  }, [muted]);

  const level = useMemo(() => {
    const { blueprint: bp, notes } = repairBlueprint(blueprint, seed);
    return { bp, map: generateMap(bp, seed), notes };
  }, [blueprint, seed]);

  useEffect(() => {
    let game: import("phaser").Game | undefined;
    let cancelled = false;
    let msgId = 0;
    const bridge: Bridge = {
      message: (text, tone = "mood") => setMessages((m) => [...m.slice(-2), { id: msgId++, text, tone }]),
      objectives: setObjectives,
      inventory: setInventory,
      talk: setTalking,
      lives: setLives,
      end: setResult,
    };
    (async () => {
      const Phaser = await import("phaser");
      const { HauntScene } = await import("@/game/HauntScene");
      const { composeSheet } = await import("@/game/compose");
      const looks: [string, Appearance][] = [
        ["player", DEFAULT_PLAYER],
        ...level.bp.cast.map((c): [string, Appearance] => [c.id, c.appearance]),
      ];
      const sheets: Sheets = Object.fromEntries(
        await Promise.all(
          looks.map(async ([id, look]) => [id, { walk: await composeSheet(look, "walk"), hurt: await composeSheet(look, "hurt") }] as const),
        ),
      );
      if (cancelled || !host.current) return;
      setPortraits(Object.fromEntries(Object.entries(sheets).map(([id, s]) => [id, portrait(s.walk)])));
      setPlayerSheet(sheets.player);
      const s = new HauntScene();
      game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: host.current,
        backgroundColor: "#000000",
        pixelArt: true,
        scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      });
      game.scene.add("haunt", s, true, { blueprint: level.bp, map: level.map, bridge, sheets, difficulty, audio: audio.current!, graves });
      if (hauntId) void fetch(`/api/haunts/${hauntId}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"kind":"enter"}' });
      scene.current = s;
      // handy for poking at a run from devtools; never shipped
      if (process.env.NODE_ENV === "development") (window as unknown as { __haunt: HauntScene }).__haunt = s;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      scene.current = null;
      game?.destroy(true);
      setReady(false);
      setMessages([]);
      setResult(null);
      setTalking(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, runId]);

  const current = objectives.find((o) => o.current);
  const speaker = talking ? level.bp.cast.find((c) => c.id === talking) : null;
  const deathRoom = result?.room ? level.map.rooms.find((r) => r.id === result.room)?.name : null;

  return (
    <div className="relative flex-1 overflow-hidden bg-black">
      <div ref={host} className="absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink">
          <p className="waiting font-serif text-lg italic text-paper/60">lighting the candles</p>
        </div>
      )}

      <aside className="pointer-events-none absolute left-5 top-5 w-[min(80vw,290px)] bg-ink/70 px-4 py-3">
        <h2 className="font-serif text-lg leading-tight">{level.bp.title}</h2>
        <div className="my-2 h-px bg-paper/15" />
        <ol className="space-y-1">
          {objectives.map((o) => (
            <li
              key={o.id}
              className={`flex gap-2 font-serif text-[15px] leading-snug ${o.done ? "text-paper/30 line-through" : o.current ? "text-paper" : "text-paper/40"}`}
            >
              <span className={`w-3 shrink-0 ${o.current ? "text-gilt" : ""}`}>{o.done ? "✓" : o.current ? "›" : ""}</span>
              {o.text}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-center gap-1" title={`${difficulty.name}: ${lives} candle${lives === 1 ? "" : "s"} left`}>
          {Array.from({ length: difficulty.lives }, (_, i) => (
            <span key={i} className={`h-3.5 w-1 ${i < lives ? "bg-paper" : "bg-paper/15"}`} />
          ))}
          <span className="label ml-2 text-[0.7rem]">{difficulty.name}</span>
        </div>
      </aside>

      <nav className="absolute right-5 top-5 flex gap-4 bg-ink/70 px-3 py-1.5 font-sc text-sm tracking-wider">
        <button onClick={() => setMuted(muted === "1" ? "0" : "1")} className="text-paper/55 hover:text-paper" title="M">
          {muted === "1" ? "Sound off" : "Sound on"}
        </button>
        <button onClick={onExit} className="text-paper/55 hover:text-paper">
          Flee
        </button>
      </nav>

      {inventory.length > 0 && (
        <div className="pointer-events-none absolute bottom-5 left-5 bg-ink/70 px-3 py-2">
          <p className="label text-[0.7rem]">carrying</p>
          {inventory.map((i) => (
            <p key={i.id} className="rise font-serif text-sm text-gilt">
              {i.name}
            </p>
          ))}
        </div>
      )}

      {!speaker && !result && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 w-[min(92vw,720px)] -translate-x-1/2 text-center">
          {messages.map((m, i) => {
            const latest = i === messages.length - 1;
            return (
              <p
                key={m.id}
                className={`rise font-serif leading-snug ${TONE[m.tone] ?? TONE.mood} ${latest ? "text-xl" : "mb-1 text-base opacity-40"}`}
                style={{ textShadow: "0 2px 12px #000, 0 0 2px #000" }}
              >
                {m.text}
              </p>
            );
          })}
          <p className="label mt-3 text-[0.7rem]">
            wasd move · e speak · m sound{difficulty.guide ? " · follow the marigolds" : ""}
          </p>
        </div>
      )}

      {speaker && (
        <Dialogue
          blueprint={level.bp}
          character={speaker}
          portrait={portraits[speaker.id]}
          inventory={inventory.map((i) => i.id)}
          objective={current?.text}
          onClose={() => {
            setTalking(null);
            scene.current?.endTalk(speaker.id);
          }}
        />
      )}

      {result && (
        <EndScreen
          result={result}
          blueprint={level.bp}
          seed={seed}
          hauntId={hauntId}
          original={blueprint}
          roomName={deathRoom}
          difficulty={difficulty.name}
          sheet={result.outcome === "died" ? playerSheet?.hurt : playerSheet?.walk}
          onRetry={() => setRunId((r) => r + 1)}
          onExit={onExit}
        />
      )}
    </div>
  );
}
