import { Button, Heading, Img, Text } from "@react-email/components";
import { Badge, EmailLayout, button, h1, lead, type EmailFooter } from "./Layout";

export type CardScheduledProps = { appUrl: string; toName: string; whenText: string; imageUrl: string; manageUrl: string; footer?: EmailFooter };

/** Confirmation to the sender that a card is scheduled. */
export default function CardScheduled(p: CardScheduledProps) {
  return (
    <EmailLayout appUrl={p.appUrl} footer={p.footer} preview={`Your card to ${p.toName} sends ${p.whenText}`}>
      <Badge>🗓️&nbsp; SCHEDULED</Badge>
      <Heading as="h1" style={h1}>
        Your card is scheduled
      </Heading>
      <Text style={lead}>
        We&apos;ll email it to {p.toName} on {p.whenText}. You can change or cancel it until then.
      </Text>
      <Img src={p.imageUrl} alt={`Your card to ${p.toName}`} width={260} style={{ width: 260, height: "auto", borderRadius: 12, margin: "0 auto 22px", boxShadow: "0 6px 20px rgba(0,0,0,0.12)" }} />
      <Button href={p.manageUrl} style={button}>
        See My cards
      </Button>
    </EmailLayout>
  );
}

CardScheduled.PreviewProps = {
  appUrl: "https://my.magicportraits.ai",
  toName: "Grandma Rose",
  whenText: "31 Dec at 18:00 (UTC)",
  imageUrl: "https://my.magicportraits.ai/theme-placeholders/thumbs/new-year-midnight.jpg",
  manageUrl: "https://my.magicportraits.ai/cards",
} satisfies CardScheduledProps;
