// Draws the placeholder seed artwork (the 10 CardPreview looks): a 1500×2100 background per version
// (colour, decoration, headline) and a 300×420 thumbnail of a sample card.
// Run: pnpm exec tsx scripts/gen-theme-placeholders.ts
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import { SEED_THEMES, defaultLayout, type Look } from "../lib/seed-data";
import { drawCard, registerFonts } from "../lib/render/render";
import { parseLayout } from "../lib/render/layout";

registerFonts();
const W = 1500;
const H = 2100;

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function decor(ctx: SKRSContext2D, look: Look, seed: number) {
  const r = rand(seed);
  const palette = [look.accent, "#E4572E", "#2FA37A", "#7B61FF", "#F2A541", "#E86A92"];
  const around = (fn: (x: number, y: number, i: number) => void, n: number) => {
    for (let i = 0; i < n; i++) {
      let x = r() * W;
      const y = r() * H;
      // keep the middle (photo and text) clear
      if (x > 200 && x < W - 200 && y < H - 100) x = r() < 0.5 ? r() * 190 : W - r() * 190;
      fn(x, y, i);
    }
  };
  ctx.save();
  switch (look.decor) {
    case "confetti":
      around((x, y, i) => {
        ctx.fillStyle = palette[i % palette.length];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r() * Math.PI);
        if (i % 3 === 0) {
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-26, -9, 52, 18);
        ctx.restore();
      }, 46);
      break;
    case "balloons":
      around((x, y, i) => {
        ctx.fillStyle = palette[i % palette.length];
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(x, y, 52, 64, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = look.ink;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + 64);
        ctx.quadraticCurveTo(x - 20, y + 120, x, y + 170);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }, 12);
      break;
    case "star":
    case "fireworks":
      around((x, y, i) => {
        ctx.strokeStyle = look.accent;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 4;
        const n = look.decor === "star" ? 5 : 12;
        const len = look.decor === "star" ? 22 + (i % 3) * 10 : 40 + (i % 4) * 12;
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }, look.decor === "star" ? 26 : 16);
      break;
    case "snow":
      around((x, y, i) => {
        ctx.fillStyle = i % 4 === 0 ? look.accent : "#BFD0DE";
        ctx.beginPath();
        ctx.arc(x, y, 6 + (i % 4) * 4, 0, Math.PI * 2);
        ctx.fill();
      }, 70);
      break;
    case "bubbles":
      around((x, y, i) => {
        ctx.strokeStyle = look.accent;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 10 + (i % 5) * 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }, 40);
      break;
    case "leaves":
    case "pines":
      around((x, y, i) => {
        ctx.fillStyle = i % 2 ? look.accent : "#7FA071";
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(look.decor === "pines" ? 0 : r() * Math.PI);
        ctx.beginPath();
        if (look.decor === "pines") {
          ctx.moveTo(0, -60);
          ctx.lineTo(40, 30);
          ctx.lineTo(-40, 30);
        } else ctx.ellipse(0, 0, 18, 44, 0, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }, 24);
      break;
    case "hearts":
      around((x, y, i) => {
        ctx.fillStyle = i % 2 ? look.accent : "#E58AA2";
        ctx.globalAlpha = 0.8;
        const s = 18 + (i % 3) * 8;
        ctx.beginPath();
        ctx.moveTo(x, y + s);
        ctx.bezierCurveTo(x - s * 2, y - s / 2, x - s / 2, y - s * 1.6, x, y - s / 3);
        ctx.bezierCurveTo(x + s / 2, y - s * 1.6, x + s * 2, y - s / 2, x, y + s);
        ctx.fill();
        ctx.globalAlpha = 1;
      }, 28);
      break;
  }
  ctx.restore();
}

const sample = readFileSync(new URL("../public/fixtures/portraits/pet-1.jpg", import.meta.url));
let seed = 7;
for (const t of SEED_THEMES) {
  for (const v of t.versions) {
    const c = createCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.fillStyle = v.look.bg;
    ctx.fillRect(0, 0, W, H);
    decor(ctx, v.look, seed++);
    ctx.fillStyle = v.look.ink;
    ctx.textAlign = "center";
    let size = 170;
    ctx.font = `400 ${size}px "DM Serif Display"`;
    while (ctx.measureText(v.look.headline).width > 1240 && size > 90) ctx.font = `400 ${(size -= 4)}px "DM Serif Display"`;
    ctx.fillText(v.look.headline, W / 2, 285);
    ctx.fillStyle = v.look.accent;
    ctx.font = `700 46px "Plus Jakarta Sans"`;
    try {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = "8px";
    } catch {
      /* */
    }
    ctx.fillText(v.look.sub, W / 2, 380);
    const bg = c.toBuffer("image/jpeg", 88);
    const file = `${t.slug}-${v.slug}.jpg`;
    writeFileSync(new URL(`../public/theme-placeholders/${file}`, import.meta.url), bg);
    const thumb = await drawCard({
      layout: parseLayout(defaultLayout(v.look)),
      background: bg,
      portrait: sample,
      photoBg: v.look.photoBg,
      to: "Grandma Rose",
      from: "Sam",
      message: "Wishing you the happiest day. Thought you would love seeing Biscuit in his royal robes!",
      footerText: "Made with Magic Portraits AI",
      size: { w: 300, h: 420 },
    });
    writeFileSync(new URL(`../public/theme-placeholders/thumbs/${file}`, import.meta.url), await thumb.encode("jpeg", 82));
  }
}
console.log("wrote placeholder backgrounds and thumbnails");
