import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, brand, button } from "./Layout";

export type SigninLinkProps = { appUrl: string; link: string; days: number; firstName: string | null };

/** Sent when a super user resends someone's one-tap sign-in link. */
export default function SigninLink(p: SigninLinkProps) {
  return (
    <EmailLayout appUrl={p.appUrl} preview="Your link to My Magic Portraits">
      <Heading as="h1" style={{ fontSize: 24, margin: "0 0 8px" }}>
        {p.firstName ? `Hi ${p.firstName},` : "Hi,"} here&apos;s your link
      </Heading>
      <Text style={{ fontSize: 16, color: brand.muted, margin: 0 }}>Tap below to open My Magic Portraits: your portraits, greeting cards, orders and downloads. No password or code needed.</Text>
      <Section style={{ textAlign: "center", padding: "22px 0 8px" }}>
        <Button href={p.link} style={button}>
          Open My Magic Portraits
        </Button>
      </Section>
      <Text style={{ fontSize: 13, color: brand.muted, margin: 0 }}>The link works for {p.days} days. Please don&apos;t forward this email: the link signs you in.</Text>
    </EmailLayout>
  );
}

SigninLink.PreviewProps = { appUrl: "https://my.magicportraits.ai", link: "https://my.magicportraits.ai/g/example", days: 30, firstName: "Sam" } satisfies SigninLinkProps;
