// Draws the made-up blank product photos in public/fixtures/shop/ (fixtures, golden tests, local dev).
// Run: node --experimental-strip-types --no-warnings scripts/gen-shop-fixtures.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { FIXTURE_SCENES, SCENE_SIZE } from "../lib/shop/fixture-scenes.ts";

const S = SCENE_SIZE;
const P = (v: number) => v * S;

function wall(ctx: SKRSContext2D, top: string, bottom: string, tableFrom = 0.78, table = "#D8C9B4") {
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = table;
  ctx.fillRect(0, P(tableFrom), S, S - P(tableFrom));
}

function quad(ctx: SKRSContext2D, pts: [number, number][], grow = 0) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4;
  const cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const px = P(x) + (dx / len) * grow;
    const py = P(y) + (dy / len) * grow;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.closePath();
}

function shadow(ctx: SKRSContext2D, blur = 30, y = 12) {
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = y;
}
const noShadow = (ctx: SKRSContext2D) => {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
};

const scenes: Record<string, (ctx: SKRSContext2D) => void> = {
  poster(ctx) {
    wall(ctx, "#EEE8DE", "#E2DACD", 0.86);
    const z = FIXTURE_SCENES.poster.zone;
    if (z.kind !== "corners") return;
    shadow(ctx);
    ctx.fillStyle = "#2B2B2B";
    quad(ctx, z.points, 26);
    ctx.fill();
    noShadow(ctx);
    ctx.fillStyle = "#FFFFFF";
    quad(ctx, z.points, 14);
    ctx.fill();
    ctx.fillStyle = "#F4F4F4";
    quad(ctx, z.points);
    ctx.fill();
  },
  acrylic(ctx) {
    wall(ctx, "#F1ECE4", "#E7DFD3", 0.62);
    const z = FIXTURE_SCENES.acrylic.zone;
    if (z.kind !== "corners") return;
    shadow(ctx, 24, 18);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    quad(ctx, z.points, 10);
    ctx.fill();
    noShadow(ctx);
    ctx.fillStyle = "rgba(190,210,220,0.55)";
    ctx.fillRect(P(0.31), P(0.66), P(0.38), P(0.035));
    ctx.fillStyle = "#EDEDED";
    quad(ctx, z.points);
    ctx.fill();
  },
  tile(ctx) {
    wall(ctx, "#E8EEF0", "#DCE3E6", 0.9);
    const z = FIXTURE_SCENES.tile.zone;
    if (z.kind !== "corners") return;
    shadow(ctx, 20, 14);
    ctx.fillStyle = "#1E1E1E";
    quad(ctx, z.points, 18);
    ctx.fill();
    noShadow(ctx);
    ctx.fillStyle = "#EFEFEF";
    quad(ctx, z.points);
    ctx.fill();
  },
  mug(ctx) {
    wall(ctx, "#EFE9E1", "#E5DCCF", 0.74, "#CDBBA3");
    const z = FIXTURE_SCENES.mug.zone;
    if (z.kind !== "wrap") return;
    const left = P(0.2);
    const right = P(0.67);
    const top = P(0.27);
    const bottom = P(0.79);
    // Handle
    ctx.strokeStyle = "#F2F2F2";
    ctx.lineWidth = P(0.045);
    ctx.beginPath();
    ctx.ellipse(right + P(0.035), P(0.52), P(0.09), P(0.13), 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    // Body with cylinder shading
    shadow(ctx, 30, 16);
    const g = ctx.createLinearGradient(left, 0, right, 0);
    g.addColorStop(0, "#CFCFCF");
    g.addColorStop(0.25, "#FAFAFA");
    g.addColorStop(0.55, "#FFFFFF");
    g.addColorStop(1, "#C4C4C4");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, bottom - P(0.03));
    ctx.ellipse((left + right) / 2, bottom - P(0.03), (right - left) / 2, P(0.03), 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    noShadow(ctx);
    // Rim
    ctx.fillStyle = "#E9E9E9";
    ctx.beginPath();
    ctx.ellipse((left + right) / 2, top, (right - left) / 2, P(0.03), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#BDBDBD";
    ctx.beginPath();
    ctx.ellipse((left + right) / 2, top, (right - left) / 2 - P(0.012), P(0.02), 0, 0, Math.PI * 2);
    ctx.fill();
  },
  ornament(ctx) {
    wall(ctx, "#1F3B2D", "#16291F", 1);
    ctx.strokeStyle = "#C9A44C";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(P(0.5), 0);
    ctx.lineTo(P(0.5), P(0.27));
    ctx.stroke();
    ctx.fillStyle = "#C9A44C";
    ctx.fillRect(P(0.47), P(0.265), P(0.06), P(0.04));
    shadow(ctx, 30, 10);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(P(0.5), P(0.5), P(0.205), 0, Math.PI * 2);
    ctx.fill();
    noShadow(ctx);
  },
  pillow(ctx) {
    wall(ctx, "#D9D3CB", "#CFC7BC", 0.8, "#8E7F6E");
    shadow(ctx, 36, 18);
    const g = ctx.createRadialGradient(P(0.5), P(0.46), P(0.05), P(0.5), P(0.48), P(0.4));
    g.addColorStop(0, "#FFFFFF");
    g.addColorStop(1, "#D9D9D9");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(P(0.21), P(0.19), P(0.58), P(0.58), P(0.07));
    ctx.fill();
    noShadow(ctx);
  },
  puzzle(ctx) {
    wall(ctx, "#E9E2D6", "#DCD2C2", 0.2, "#C8B79F");
    const z = FIXTURE_SCENES.puzzle.zone;
    if (z.kind !== "corners") return;
    shadow(ctx, 18, 10);
    ctx.fillStyle = "#F2F2F2";
    quad(ctx, z.points, 4);
    ctx.fill();
    noShadow(ctx);
  },
};

mkdirSync(new URL("../public/fixtures/shop/", import.meta.url), { recursive: true });
for (const [name, draw] of Object.entries(scenes)) {
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");
  draw(ctx);
  writeFileSync(new URL(`../public/fixtures/shop/${name}.jpg`, import.meta.url), canvas.encodeSync("jpeg", 88));
}
console.log(`wrote ${Object.keys(scenes).length} scenes to public/fixtures/shop/`);
