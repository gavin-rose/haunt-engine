// The shareable grave: a 1200x630 image (the size social previews expect) drawn on a canvas
// in the browser from the run that just ended.

export type CardInput = {
  outcome: "died" | "escaped";
  title: string;
  epitaph: string;
  killer?: string;
  room?: string | null;
  seconds: number;
  difficulty: string;
  sprite?: HTMLCanvasElement;
};

const W = 1200;
const H = 630;

export function drawCard(c: CardInput): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const serif = getComputedStyle(document.documentElement).getPropertyValue("--font-fell").trim() || "Georgia";
  const font = (size: number, italic = false) => `${italic ? "italic " : ""}${size}px ${serif}, Georgia, serif`;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0c0b0d");
  bg.addColorStop(1, "#141216");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(231,225,214,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.strokeStyle = "rgba(231,225,214,0.12)";
  ctx.strokeRect(34, 34, W - 68, H - 68);

  let seed = c.seconds * 97 + c.title.length;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    ctx.save();
    ctx.translate(90 + rand() * 430, H - 52 - rand() * 18);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = rand() > 0.5 ? "#b8661f" : "#94481a";
    ctx.globalAlpha = 0.55 + rand() * 0.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  const sx = 70,
    sy = 80,
    sw = 470,
    sh = 500;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx, sy + sh);
  ctx.lineTo(sx, sy + sw / 2);
  ctx.arc(sx + sw / 2, sy + sw / 2, sw / 2, Math.PI, 0);
  ctx.lineTo(sx + sw, sy + sh);
  ctx.closePath();
  const stone = ctx.createLinearGradient(0, sy, 0, sy + sh);
  if (c.outcome === "died") {
    stone.addColorStop(0, "#4a4547");
    stone.addColorStop(1, "#1e1b1d");
  } else {
    stone.addColorStop(0, "#2a2f33");
    stone.addColorStop(1, "#16191b");
  }
  ctx.fillStyle = stone;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 40;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(232,224,210,0.18)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(232,224,210,0.6)";
  ctx.font = font(26);
  ctx.fillText(c.outcome === "died" ? "H E R E   L I E S" : "T H E Y   G O T   O U T", sx + sw / 2, sy + 160);
  ctx.fillStyle = "#e8e0d2";
  ctx.font = font(64);
  ctx.fillText(c.outcome === "died" ? "a Visitor" : "Alive", sx + sw / 2, sy + 235);
  ctx.fillStyle = "rgba(232,224,210,0.3)";
  ctx.fillRect(sx + sw / 2 - 70, sy + 262, 140, 2);
  ctx.fillStyle = "#e8e0d2";
  ctx.font = font(30, true);
  wrap(ctx, c.epitaph, sx + sw / 2, sy + 315, sw - 90, 38, 5);

  ctx.textAlign = "left";
  const rx = 600;
  ctx.fillStyle = "rgba(231,225,214,0.5)";
  ctx.font = font(22);
  ctx.fillText("H A U N T   E N G I N E", rx, 120);
  ctx.fillStyle = "#e7e1d6";
  ctx.font = font(50);
  const titleEnd = wrap(ctx, c.title, rx, 185, 540, 56, 2, "left");
  ctx.fillStyle = "rgba(232,224,210,0.85)";
  ctx.font = font(30, true);
  const line =
    c.outcome === "died"
      ? `Taken by ${c.killer ?? "something"}${c.room ? ` in the ${c.room}` : ""}.`
      : `Escaped after ${c.seconds} seconds.`;
  const after = wrap(ctx, line, rx, titleEnd + 30, 540, 38, 3, "left");
  ctx.fillStyle = "rgba(232,224,210,0.5)";
  ctx.font = font(24);
  ctx.fillText(`${c.seconds} seconds · ${c.difficulty}`, rx, after + 10);

  if (c.sprite) {
    const frame = c.outcome === "died" ? { x: 5 * 64, y: 0 } : { x: 0, y: 128 };
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = c.outcome === "died" ? 0.9 : 1;
    ctx.drawImage(c.sprite, frame.x, frame.y, 64, 64, rx + 300, H - 300, 256, 256);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#c9584e";
  ctx.font = font(30);
  ctx.fillText(c.outcome === "died" ? "Can you get out?" : "Can you?", rx, H - 70);
  return canvas;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  lh: number,
  maxLines: number,
  align: CanvasTextAlign = "center",
): number {
  ctx.textAlign = align;
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > max && line) {
      if (lines === maxLines - 1) {
        ctx.fillText(`${line}…`, x, y + lines * lh);
        return y + (lines + 1) * lh;
      }
      ctx.fillText(line, x, y + lines * lh);
      lines++;
      line = words[i];
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y + lines * lh);
  return y + (lines + 1) * lh;
}
