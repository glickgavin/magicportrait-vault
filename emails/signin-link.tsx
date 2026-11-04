import { Button, Heading, Text } from "@react-email/components";
import { Badge, EmailLayout, button, h1, lead, small, type EmailFooter } from "./Layout";

export type SigninLinkProps = { appUrl: string; link: string; days: number; firstName: string | null; footer?: EmailFooter };

/** Sent when a super user resends someone's one-tap sign-in link. */
export default function SigninLink(p: SigninLinkProps) {
  return (
    <EmailLayout appUrl={p.appUrl} footer={p.footer} preview="Your link to My Magic Portraits">
      <Badge>✨&nbsp; MY MAGIC PORTRAITS</Badge>
      <Heading as="h1" style={h1}>
        {p.firstName ? `Hi ${p.firstName}, here's your link` : "Here's your link"}
      </Heading>
      <Text style={lead}>Tap below to open My Magic Portraits: your portraits, greeting cards, orders and downloads. No password or code needed.</Text>
      <Button href={p.link} style={button}>
        Open My Magic Portraits
      </Button>
      <Text style={small}>The link works for {p.days} days. Please don&apos;t forward this email: the link signs you in.</Text>
    </EmailLayout>
  );
}

SigninLink.PreviewProps = { appUrl: "https://my.magicportraits.ai", link: "https://my.magicportraits.ai/g/example", days: 30, firstName: "Sam" } satisfies SigninLinkProps;
