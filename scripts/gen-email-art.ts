// Builds public/email/card-fan.jpg: three theme-pack preview cards fanned out, for the offer email.
// The previews use a made-up illustrated sample portrait (assets/themes/README.md), never a customer's.
//   node --experimental-strip-types --no-warnings scripts/gen-email-art.ts
import sharp from "sharp";

const W = 1040; // 2x of the 520 px email width
const H = 560;
const CARD_W = 300;
const CARD_H = Math.round(CARD_W * 1.4);
const cards = [
  { file: "assets/themes/birthday/confetti-pop/birthday-confetti-pop-preview.jpg", angle: -8, x: 120, y: 85 },
  { file: "assets/themes/new-year/midnight-gold/new-year-midnight-gold-preview.jpg", angle: 8, x: 620, y: 85 },
  { file: "assets/themes/christmas/evergreen-gold/christmas-evergreen-gold-preview.jpg", angle: 0, x: 370, y: 40 },
];

async function card(file: string, angle: number) {
  const radius = 14;
  const mask = Buffer.from(`<svg width="${CARD_W}" height="${CARD_H}"><rect width="${CARD_W}" height="${CARD_H}" rx="${radius}" ry="${radius}"/></svg>`);
  const body = await sharp(file).resize(CARD_W, CARD_H, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  // Soft shadow under the card.
  const pad = 40;
  const shadow = await sharp({ create: { width: CARD_W + pad * 2, height: CARD_H + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from(`<svg width="${CARD_W}" height="${CARD_H}"><rect width="${CARD_W}" height="${CARD_H}" rx="${radius}" fill="rgba(60,40,20,0.16)"/></svg>`), left: pad, top: pad + 10 }])
    .blur(14)
    .png()
    .toBuffer();
  const withShadow = await sharp(shadow).composite([{ input: body, left: pad, top: pad }]).png().toBuffer();
  return sharp(withShadow).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

const layers = [];
for (const c of cards) {
  const buf = await card(c.file, c.angle);
  const m = await sharp(buf).metadata();
  layers.push({ input: buf, left: Math.round(c.x + CARD_W / 2 - m.width! / 2), top: Math.round(c.y + CARD_H / 2 - m.height! / 2) });
}
// On the email card's white, as a JPEG: smaller, and no transparency quirks in email clients.
await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .composite(layers)
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile("public/email/card-fan.jpg");
console.log("wrote public/email/card-fan.jpg");
