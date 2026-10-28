import Link from "next/link";
import packs from "@/game/assets/credits.json";
import lpc from "@/game/assets/lpc.json";

export const metadata = { title: "Credits · Haunt Engine" };

type LpcCredit = { authors?: string[]; licenses?: string[]; urls?: string[] };

export default function Credits() {
  const characters = Object.entries(lpc.credits as Record<string, LpcCredit>).sort(([a], [b]) => a.localeCompare(b));
  const artists = [...new Set(characters.flatMap(([, c]) => c.authors ?? []))]
    .filter((a) => /\w/.test(a))
    .sort((a, b) => a.localeCompare(b));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 font-serif">
      <Link href="/" className="text-sm text-paper/50 hover:text-paper">
        ← back to the haunt
      </Link>
      <h1 className="mt-6 text-5xl">Credits</h1>
      <p className="mt-4 text-lg leading-relaxed text-paper/75">
        Every room, prop and person in Haunt Engine is drawn with art from the Liberated Pixel Cup community, shared under open
        licenses. The haunting itself is written by open-weight models. Thank you to everyone below for giving their work away.
      </p>

      <section className="mt-12">
        <h2 className="label text-base">The machine</h2>
        <ul className="mt-3 space-y-1 text-paper/70">
          <li>Haunt writing and dialogue: Google Gemma (open weights, Gemma Terms of Use), run locally with Ollama</li>
          <li>Game engine: Phaser 4 (MIT) · App: Next.js (MIT) · Validation: Zod (MIT)</li>
          <li>Type: IM Fell English by Igino Marini (SIL Open Font License) · Geist Mono (OFL)</li>
          <li>Sound: synthesised live in the browser with the Web Audio API; no recordings</li>
          <li>Chalkboard, paintings, portrait, mirror and window: drawn for this project in the LPC palette</li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="label text-base">Characters</h2>
        <p className="mt-2 text-paper/70">
          Built from the{" "}
          <a className="link text-paper" href="https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator">
            Universal LPC Spritesheet Character Generator
          </a>{" "}
          (CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 and others, per layer). Artists:
        </p>
        <p className="mt-3 text-sm leading-relaxed text-paper/60">{artists.join(" · ")}</p>
        <details className="mt-4 text-sm text-paper/60">
          <summary className="cursor-pointer text-paper/80 hover:text-paper">Per-layer attribution ({characters.length} layers)</summary>
          <ul className="mt-3 space-y-3">
            {characters.map(([file, c]) => (
              <li key={file}>
                <div className="font-mono text-xs text-paper/80">{file}</div>
                <div>{c.authors?.join(", ")}</div>
                <div className="text-paper/45">{c.licenses?.join(" / ")}</div>
                <div className="flex flex-wrap gap-x-3">
                  {[...new Set(c.urls)].map((u) => (
                    <a key={u} href={u} className="break-all link text-paper/60 hover:text-paper">
                      {u.replace(/^https?:\/\//, "")}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="mt-12">
        <h2 className="label text-base">Rooms and furniture</h2>
        <div className="mt-4 space-y-6">
          {packs.map((p) => (
            <article key={p.name} className="border-t border-paper/10 pt-4">
              <h3 className="text-xl">
                <a href={p.url} className="link text-paper">
                  {p.name}
                </a>
              </h3>
              <p className="text-sm text-paper/50">{p.license}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-paper/70 hover:text-paper">Full credits, as provided by the pack</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-paper/60">{p.text}</pre>
              </details>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
