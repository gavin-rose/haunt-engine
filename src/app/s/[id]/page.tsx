import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { HauntGate } from "@/components/HauntGate";
import { getHaunt, gravesFor } from "@/server/store";

export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const haunt = await getHaunt((await params).id);
  return { title: haunt ? `${haunt.blueprint.title} · Haunt Engine` : "Haunt Engine" };
}

export default function StoredHaunt({ params }: PageProps<"/s/[id]">) {
  return (
    <Suspense fallback={<p className="m-auto font-serif text-xl italic text-paper/60">unsealing…</p>}>
      <Gate params={params} />
    </Suspense>
  );
}

async function Gate({ params }: { params: PageProps<"/s/[id]">["params"] }) {
  const { id } = await params;
  const haunt = await getHaunt(id);
  if (!haunt) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-serif text-2xl text-paper/70">Nothing is buried here.</p>
        <Link href="/" className="link font-serif text-paper">
          write your own haunting →
        </Link>
      </main>
    );
  }
  const graves = (await gravesFor(id)).map((g) => ({
    x: g.x,
    y: g.y,
    epitaph: g.epitaph,
    seconds: g.seconds,
    killer: g.killer,
    difficulty: g.difficulty,
  }));
  return (
    <HauntGate
      blueprint={haunt.blueprint}
      seed={haunt.seed}
      hauntId={id}
      stats={{ entered: haunt.entered, died: haunt.died, escaped: haunt.escaped }}
      graves={graves}
    />
  );
}
