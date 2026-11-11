/**
 * A product description from Shopify, kept as paragraphs and bullet lists.
 *
 * Shopify's descriptionHtml is turned into plain text blocks here and rendered as text, never as HTML,
 * so nothing in a description can run on our pages. Lines written as "- item", "• item" or "* item"
 * (one per paragraph, as Shopify's editor often stores them) become a list, as do real <li> items.
 */
export type DescriptionBlock = { kind: "p"; text: string } | { kind: "list"; items: string[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·", deg: "°", times: "×", reg: "®", trade: "™", copy: "©" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const BULLET = /^\s*(?:[-–—•*·]|\d+[.)])\s+/;

/** The description as blocks; falls back to the plain-text description when there is no HTML. */
export function descriptionBlocks(html: string | null | undefined, plain = ""): DescriptionBlock[] {
  const src = (html ?? "").trim();
  let lines: { text: string; li: boolean }[];
  if (src) {
    const marked = src
      .replace(/<(script|style|template|iframe|object)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<li[^>]*>/gi, "\n\u0001")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|section|blockquote)>/gi, "\n")
      .replace(/<(p|div|ul|ol|h[1-6]|tr|table|section|blockquote)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    lines = decode(marked)
      .split("\n")
      .map((l) => ({ li: l.startsWith("\u0001"), text: l.replace(/\u0001/g, "").replace(/[ \t ]+/g, " ").trim() }))
      .filter((l) => l.text);
  } else {
    lines = plain
      .split(/\n+/)
      .map((l) => ({ li: false, text: l.trim() }))
      .filter((l) => l.text);
  }
  const out: DescriptionBlock[] = [];
  for (const l of lines) {
    const bullet = l.li || BULLET.test(l.text);
    const text = l.li ? l.text : l.text.replace(BULLET, "");
    if (!text) continue;
    const last = out[out.length - 1];
    if (bullet) {
      if (last?.kind === "list") last.items.push(text);
      else out.push({ kind: "list", items: [text] });
    } else {
      out.push({ kind: "p", text });
    }
  }
  return out.slice(0, 40);
}
