import { Body, Container, Head, Html, Img, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export const brand = {
  page: "#F3F1E7",
  ink: "#2b2b2b",
  muted: "#5f5f5f",
  pink: "#B8059F",
  tint: "#FDE7FA",
  gradient: "linear-gradient(89deg, #FF8F3F -4.82%, #F24BDF 52.24%, #DD07C4 102.1%)",
  font: "'Plus Jakarta Sans', Helvetica, Arial, sans-serif",
};

export function EmailLayout({ preview, appUrl, children, footer }: { preview: string; appUrl: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: brand.page, fontFamily: brand.font, color: brand.ink }}>
        <Container style={{ maxWidth: 480, margin: "0 auto", padding: "28px 16px" }}>
          <Section style={{ textAlign: "center", paddingBottom: 16 }}>
            <Img src={`${appUrl}/mp-logo.png`} alt="Magic Portraits AI" width={156} height={30} style={{ margin: "0 auto" }} />
          </Section>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 20, padding: "28px 24px" }}>{children}</Section>
          <Section style={{ paddingTop: 16, textAlign: "center" }}>
            {footer}
            <Text style={{ fontSize: 12, color: brand.muted, margin: "8px 0 0" }}>Magic Portraits · magicportraits.ai</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const button = {
  display: "inline-block",
  backgroundColor: "#DD07C4",
  backgroundImage: brand.gradient,
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 16,
  borderRadius: 12,
  padding: "14px 24px",
  textDecoration: "none",
} as const;

export const secondaryButton = { ...button, backgroundColor: "#F1EEE6", backgroundImage: "none", color: brand.ink } as const;
