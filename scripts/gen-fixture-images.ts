// Draws 8 made-up cartoon pet portraits for fixtures (no real customer images).
// Run: node --experimental-strip-types scripts/gen-fixture-images.ts
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

const looks = [
  { bg: ["#F7D9C4", "#E9A47E"], fur: "#C98B4F", inner: "#F3D3B0", robe: "#7B2D8B" },
  { bg: ["#CFE2F7", "#7FA7D6"], fur: "#3B3B3B", inner: "#8A8A8A", robe: "#C8473D" },
  { bg: ["#D9E4D1", "#8DB27E"], fur: "#E8E0D2", inner: "#FFFFFF", robe: "#2457B8" },
  { bg: ["#F3D5DC", "#D88AA0"], fur: "#8B5A2B", inner: "#D9A877", robe: "#1E4D3A" },
  { bg: ["#EADBB8", "#C9A35A"], fur: "#F2F2F2", inner: "#FFE1E1", robe: "#A3202F" },
  { bg: ["#263056", "#141A33"], fur: "#D88B3C", inner: "#F7D2A6", robe: "#E7C46A" },
  { bg: ["#E3DAEC", "#A48BC2"], fur: "#5A4636", inner: "#B39578", robe: "#41693E" },
  { bg: ["#FFF1D6", "#F2A541"], fur: "#1F1F1F", inner: "#5C5C5C", robe: "#2C5E8F" },
];

looks.forEach((l, i) => {
  const S = 768;
  const c = createCanvas(S, S);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, l.bg[0]);
  grad.addColorStop(1, l.bg[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // robe / shoulders
  g.fillStyle = l.robe;
  g.beginPath();
  g.ellipse(S / 2, S + 60, 330, 300, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#F5E6A8";
  g.fillRect(S / 2 - 18, S - 250, 36, 250);
  // ears
  const ear = (x: number, dir: number) => {
    g.fillStyle = l.fur;
    g.beginPath();
    g.moveTo(x, 230);
    g.lineTo(x + dir * 120, 60 + (i % 2) * 60);
    g.lineTo(x + dir * 170, 260);
    g.closePath();
    g.fill();
    g.fillStyle = l.inner;
    g.beginPath();
    g.moveTo(x + dir * 30, 230);
    g.lineTo(x + dir * 115, 110 + (i % 2) * 60);
    g.lineTo(x + dir * 140, 250);
    g.closePath();
    g.fill();
  };
  ear(S / 2 - 60, -1);
  ear(S / 2 + 60, 1);
  // head
  g.fillStyle = l.fur;
  g.beginPath();
  g.ellipse(S / 2, 360, 200, 185, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = l.inner;
  g.beginPath();
  g.ellipse(S / 2, 430, 110, 85, 0, 0, Math.PI * 2);
  g.fill();
  // eyes
  for (const dx of [-75, 75]) {
    g.fillStyle = "#1A1A1A";
    g.beginPath();
    g.arc(S / 2 + dx, 330, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#FFFFFF";
    g.beginPath();
    g.arc(S / 2 + dx + 8, 322, 8, 0, Math.PI * 2);
    g.fill();
  }
  // nose and mouth
  g.fillStyle = "#2B1B17";
  g.beginPath();
  g.ellipse(S / 2, 405, 30, 20, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#2B1B17";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(S / 2, 425);
  g.quadraticCurveTo(S / 2 - 30, 470, S / 2 - 55, 450);
  g.moveTo(S / 2, 425);
  g.quadraticCurveTo(S / 2 + 30, 470, S / 2 + 55, 450);
  g.stroke();
  // crown on some
  if (i % 3 === 0) {
    g.fillStyle = "#E9B949";
    g.beginPath();
    g.moveTo(S / 2 - 110, 190);
    for (let k = 0; k <= 4; k++) g.lineTo(S / 2 - 110 + k * 55, k % 2 ? 190 : 120);
    g.lineTo(S / 2 + 110, 200);
    g.lineTo(S / 2 - 110, 200);
    g.closePath();
    g.fill();
  }
  writeFileSync(new URL(`../public/fixtures/portraits/pet-${i + 1}.jpg`, import.meta.url), c.toBuffer("image/jpeg", 82));
});
console.log("wrote 8 fixture portraits");
