import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailLayout, brand, button } from "./Layout";

export type CardScheduledProps = { appUrl: string; toName: string; whenText: string; imageUrl: string; manageUrl: string };

/** Confirmation to the sender that a card is scheduled. */
export default function CardScheduled(p: CardScheduledProps) {
  return (
    <EmailLayout appUrl={p.appUrl} preview={`Your card to ${p.toName} sends ${p.whenText}`}>
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 6px", textAlign: "center" }}>
        Your card is scheduled
      </Heading>
      <Text style={{ fontSize: 16, color: brand.muted, margin: "0 0 18px", textAlign: "center" }}>
        We&apos;ll email it to {p.toName} on {p.whenText}. You can change or cancel it until then.
      </Text>
      <Img src={p.imageUrl} alt={`Your card to ${p.toName}`} width={240} style={{ width: 240, borderRadius: 8, margin: "0 auto" }} />
      <Section style={{ textAlign: "center", paddingTop: 20 }}>
        <Button href={p.manageUrl} style={button}>
          See My cards
        </Button>
      </Section>
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
