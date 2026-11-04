import { Button, Heading, Img, Link, Section, Text } from "@react-email/components";
import { Badge, EmailLayout, brand, button, h1, lead, secondaryButton, type EmailFooter } from "./Layout";

export type CardDeliveryProps = { appUrl: string; fromName: string; toName: string; themeName: string; imageUrl: string; openUrl: string; tryUrl: string; unsubscribeUrl: string; footer?: EmailFooter };

/** RecipientEmail: the card itself, "Save the card", "Open full size", the Try block and "Don't email me cards". */
export default function CardDelivery(p: CardDeliveryProps) {
  return (
    <EmailLayout
      appUrl={p.appUrl}
      footer={p.footer}
      preview={`${p.fromName} sent you a ${p.themeName} card`}
      preferencesUrl={p.unsubscribeUrl}
      preferencesLabel="Don't email me cards"
      note={<>You got this because {p.fromName} made you a card with My Magic Portraits.</>}
    >
      <Badge>💌&nbsp; A CARD FOR YOU</Badge>
      <Heading as="h1" style={h1}>
        {p.fromName} sent you a card
      </Heading>
      <Text style={lead}>Dear {p.toName}, here&apos;s something to make you smile.</Text>
      <Link href={p.openUrl}>
        <Img src={p.imageUrl} alt={`A ${p.themeName} card from ${p.fromName}`} width={440} style={{ width: "100%", maxWidth: 440, height: "auto", borderRadius: 12, margin: "0 auto 22px", boxShadow: "0 6px 20px rgba(0,0,0,0.12)" }} />
      </Link>
      <Button href={p.openUrl} style={button}>
        Save the card ✦
      </Button>
      <Text style={{ margin: "14px 0 0", textAlign: "center" }}>
        <Link href={p.openUrl} style={{ color: brand.pink, fontWeight: 700, fontSize: 15 }}>
          Open full size
        </Link>
      </Text>
      <Section style={{ backgroundColor: brand.tint, borderRadius: 18, padding: "20px 16px", marginTop: 26, textAlign: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Love the portrait?</Text>
        <Text style={{ fontSize: 15, color: brand.muted, margin: "0 0 14px" }}>Turn your own pet into a work of art with Magic Portraits.</Text>
        <Button href={p.tryUrl} style={secondaryButton}>
          Try Magic Portraits
        </Button>
      </Section>
    </EmailLayout>
  );
}

CardDelivery.PreviewProps = {
  appUrl: "https://my.magicportraits.ai",
  fromName: "Sam",
  toName: "Grandma Rose",
  themeName: "Christmas",
  imageUrl: "https://my.magicportraits.ai/theme-placeholders/thumbs/christmas-snowfall.jpg",
  openUrl: "https://my.magicportraits.ai/c/example",
  tryUrl: "https://my.magicportraits.ai/c/example/try?via=email",
  unsubscribeUrl: "https://my.magicportraits.ai/c/example/unsubscribe?d=example",
} satisfies CardDeliveryProps;
