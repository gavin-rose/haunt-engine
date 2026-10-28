import { CATALOG, resolveLayers, type Appearance } from "./look";

const images = new Map<string, Promise<HTMLImageElement | null>>();

function load(file: string) {
  let p = images.get(file);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `/assets/lpc/${file}`;
    });
    images.set(file, p);
  }
  return p;
}

const rgb = (hex: string) => parseInt(hex.slice(1), 16);

export async function composeSheet(look: Appearance, anim: "walk" | "hurt"): Promise<HTMLCanvasElement> {
  const { cols, rows } = CATALOG.anims[anim];
  const out = document.createElement("canvas");
  out.width = cols * 64;
  out.height = rows * 64;
  const ctx = out.getContext("2d")!;
  const layers = resolveLayers(look, anim);
  const loaded = await Promise.all(layers.map((l) => load(l.file)));

  const scratch = document.createElement("canvas");
  scratch.width = out.width;
  scratch.height = out.height;
  const sctx = scratch.getContext("2d", { willReadFrequently: true })!;

  layers.forEach((layer, i) => {
    const img = loaded[i];
    if (!img) return;
    if (!layer.maps.length) {
      ctx.drawImage(img, 0, 0);
      return;
    }
    const lut = new Map<number, number>();
    for (const m of layer.maps) {
      const pal = CATALOG.palettes[m.material].colors;
      const from = pal[m.from];
      const to = pal[m.to];
      if (!from || !to) continue;
      from.forEach((c, k) => to[k] && lut.set(rgb(c), rgb(to[k])));
    }
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    sctx.drawImage(img, 0, 0);
    const data = sctx.getImageData(0, 0, scratch.width, scratch.height);
    const px = data.data;
    for (let p = 0; p < px.length; p += 4) {
      if (!px[p + 3]) continue;
      const hit = lut.get((px[p] << 16) | (px[p + 1] << 8) | px[p + 2]);
      if (hit === undefined) continue;
      px[p] = hit >> 16;
      px[p + 1] = (hit >> 8) & 255;
      px[p + 2] = hit & 255;
    }
    sctx.putImageData(data, 0, 0);
    ctx.drawImage(scratch, 0, 0);
  });
  return out;
}
