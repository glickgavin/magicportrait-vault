import { Button, Heading, Img, Link, Section, Text } from "@react-email/components";
import { EmailLayout, brand, button, secondaryButton } from "./Layout";

export type CardDeliveryProps = { appUrl: string; fromName: string; toName: string; themeName: string; imageUrl: string; openUrl: string; tryUrl: string; unsubscribeUrl: string };

/** RecipientEmail: the card itself, "Save the card", "Open full size", the Try block and "Don't email me cards". */
export default function CardDelivery(p: CardDeliveryProps) {
  return (
    <EmailLayout
      appUrl={p.appUrl}
      preview={`${p.fromName} sent you a ${p.themeName} card`}
      footer={
        <Text style={{ fontSize: 12, color: brand.muted, margin: 0 }}>
          You got this because {p.fromName} made you a card with My Magic Portraits.{" "}
          <Link href={p.unsubscribeUrl} style={{ color: brand.muted, textDecoration: "underline" }}>
            Don&apos;t email me cards
          </Link>
        </Text>
      }
    >
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 4px", textAlign: "center" }}>
        {p.fromName} sent you a card
      </Heading>
      <Text style={{ fontSize: 15, color: brand.muted, margin: "0 0 18px", textAlign: "center" }}>Dear {p.toName}, here&apos;s something to make you smile.</Text>
      <Link href={p.openUrl}>
        <Img src={p.imageUrl} alt={`A ${p.themeName} card from ${p.fromName}`} width={432} style={{ width: "100%", maxWidth: 432, borderRadius: 8, margin: "0 auto" }} />
      </Link>
      <Section style={{ textAlign: "center", paddingTop: 20 }}>
        <Button href={p.openUrl} style={button}>
          Save the card
        </Button>
        <Text style={{ margin: "10px 0 0" }}>
          <Link href={p.openUrl} style={{ color: brand.pink, fontWeight: 700 }}>
            Open full size
          </Link>
        </Text>
      </Section>
      <Section style={{ backgroundColor: brand.tint, borderRadius: 16, padding: "18px 16px", marginTop: 24, textAlign: "center" }}>
        <Text style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>Love the portrait?</Text>
        <Text style={{ fontSize: 14, color: brand.muted, margin: "0 0 12px" }}>Turn your own pet into a work of art with Magic Portraits.</Text>
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
