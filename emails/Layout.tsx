import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export const brand = {
  page: "#F3F1E7",
  band: "#E8E5DB",
  ink: "#2b2b2b",
  muted: "#5f5f5f",
  pink: "#B8059F",
  tint: "#FDE7FA",
  gradient: "linear-gradient(89deg, #FF8F3F -4.82%, #F24BDF 52.24%, #DD07C4 102.1%)",
  font: "'Plus Jakarta Sans', Helvetica, Arial, sans-serif",
};

/** Footer band content. Values come from settings (lib/email/footer.ts); these are the fallbacks. */
export type EmailFooter = { company: string; address: string; chatUrl: string; privacyUrl: string };
export const DEFAULT_FOOTER: EmailFooter = { company: "StoryBoards", address: "", chatUrl: "https://magicportraits.ai", privacyUrl: "https://magicportraits.ai/privacy" };

/**
 * Every email: logo, a white card, optional rows under it (`after`), then the grey footer band with
 * the company line and Chat with us · Email preferences · Privacy Policy. `note` is a line in the band
 * (why you got this); `preferencesUrl` adds the preferences link (emails people can opt out of).
 */
export function EmailLayout({
  preview,
  appUrl,
  children,
  after,
  note,
  preferencesUrl,
  preferencesLabel = "Email preferences",
  footer = DEFAULT_FOOTER,
}: {
  preview: string;
  appUrl: string;
  children: ReactNode;
  after?: ReactNode;
  note?: ReactNode;
  preferencesUrl?: string;
  preferencesLabel?: string;
  footer?: EmailFooter;
}) {
  const links: [string, string][] = [["Chat with us", footer.chatUrl], ...(preferencesUrl ? [[preferencesLabel, preferencesUrl] as [string, string]] : []), ["Privacy Policy", footer.privacyUrl]];
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: brand.page, fontFamily: brand.font, color: brand.ink }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "28px 0 0" }}>
          <Section style={{ textAlign: "center", padding: "0 16px 22px" }}>
            <Img src={`${appUrl}/mp-logo.png`} alt="Magic Portraits AI" width={210} height={40} style={{ margin: "0 auto" }} />
          </Section>
          <Section style={{ padding: "0 16px" }}>
            <Section style={{ backgroundColor: "#ffffff", borderRadius: 24, padding: "32px 26px 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>{children}</Section>
          </Section>
          {after && <Section style={{ padding: "14px 16px 0" }}>{after}</Section>}
          <Section style={{ backgroundColor: brand.band, borderRadius: "32px 32px 0 0", padding: "28px 20px 32px", marginTop: 28, textAlign: "center" }}>
            <Img src={`${appUrl}/mp-logo.png`} alt="Magic Portraits AI" width={150} height={29} style={{ margin: "0 auto 14px" }} />
            {note && <Text style={{ fontSize: 13, lineHeight: "19px", color: brand.muted, margin: "0 0 10px" }}>{note}</Text>}
            <Text style={{ fontSize: 14, color: brand.muted, margin: "0 0 10px" }}>{[footer.company, footer.address].filter(Boolean).join(" · ")}</Text>
            <Text style={{ fontSize: 14, margin: 0 }}>
              {links.map(([label, href], i) => (
                <span key={label}>
                  {i > 0 && <span style={{ color: brand.muted }}> · </span>}
                  <Link href={href} style={{ color: brand.pink, textDecoration: "underline" }}>
                    {label}
                  </Link>
                </span>
              ))}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Pink pill above the headline, e.g. "🎁 FREE GIFT UNLOCKED". */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <Section style={{ textAlign: "center", paddingBottom: 14 }}>
      <span style={{ display: "inline-block", backgroundColor: brand.tint, color: brand.pink, borderRadius: 999, padding: "8px 18px", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em" }}>
        {children}
      </span>
    </Section>
  );
}

export const h1 = { fontSize: 30, lineHeight: "36px", fontWeight: 800, letterSpacing: "-0.02em", textAlign: "center", margin: "0 0 12px", color: brand.ink } as const;
export const lead = { fontSize: 17, lineHeight: "26px", color: brand.muted, textAlign: "center", margin: "0 0 20px" } as const;
export const small = { fontSize: 14, lineHeight: "20px", color: brand.muted, textAlign: "center", margin: "12px 0 0" } as const;

/** Full-width gradient button (solid pink where gradients aren't supported). */
export const button = {
  display: "block",
  backgroundColor: "#DD07C4",
  backgroundImage: brand.gradient,
  color: "#ffffff",
  fontWeight: 800,
  fontSize: 19,
  textAlign: "center",
  borderRadius: 16,
  padding: "17px 24px",
  textDecoration: "none",
  boxShadow: "0 4px 0 rgba(160,40,120,0.18)",
} as const;

export const secondaryButton = { ...button, display: "inline-block", fontSize: 16, fontWeight: 700, padding: "12px 22px", backgroundColor: "#F1EEE6", backgroundImage: "none", color: brand.ink, boxShadow: "none" } as const;

/** A numbered row under the card ("1  Pick a theme. Birthday, Christmas, …"). */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Section style={{ backgroundColor: "#ffffff", borderRadius: 18, padding: "16px 18px", marginBottom: 12 }}>
      <Row>
        <Column style={{ width: 44, verticalAlign: "middle" }}>
          <div style={{ width: 36, height: 36, lineHeight: "36px", borderRadius: 18, backgroundColor: brand.tint, color: brand.pink, fontWeight: 800, fontSize: 17, textAlign: "center" }}>{n}</div>
        </Column>
        <Column style={{ verticalAlign: "middle", paddingLeft: 10 }}>
          <Text style={{ fontSize: 16, lineHeight: "22px", margin: 0, color: brand.ink }}>
            <strong>{title}</strong> {children}
          </Text>
        </Column>
      </Row>
    </Section>
  );
}
