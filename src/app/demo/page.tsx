"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { HauntBlueprint } from "@/haunt/schema";
import stAgnes from "@/haunt/demos/st-agnes.json";

const GameView = dynamic(() => import("@/components/GameView").then((m) => m.GameView), { ssr: false });

export default function Demo() {
  const router = useRouter();
  return <GameView blueprint={stAgnes as HauntBlueprint} seed="agnes" onExit={() => router.push("/")} />;
}
