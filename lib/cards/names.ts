/** "magic-portraits-card-grandma-rose.jpg" — no ids or emails in file names. */
export function downloadName(card: { to_name: string; public_id: string }): string {
  const who = card.to_name.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40);
  return `magic-portraits-card${who ? `-${who}` : ""}.jpg`;
}
