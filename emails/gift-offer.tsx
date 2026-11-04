import { Button, Heading, Img, Link, Section, Text } from "@react-email/components";
import { EmailLayout, brand, button } from "./Layout";

export type GiftOfferProps = {
  appUrl: string;
  firstName: string | null;
  orderName: string | null;
  portraitImageUrl: string | null;
  linkUrl: string;
  validDays: number;
  unsubscribeUrl: string;
};

/** The free gift offer: a one-tap link to make a free greeting card with their portrait. */
export default function GiftOffer(p: GiftOfferProps) {
  return (
    <EmailLayout
      appUrl={p.appUrl}
      preview="Make a free greeting card with your portrait"
      footer={
        <Text style={{ fontSize: 12, color: brand.muted, margin: 0 }}>
          You got this because of your Magic Portraits order{p.orderName ? ` ${p.orderName}` : ""}.{" "}
          <Link href={p.unsubscribeUrl} style={{ color: brand.muted, textDecoration: "underline" }}>
            Don&apos;t email me offers
          </Link>
        </Text>
      }
    >
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 4px", textAlign: "center" }}>
        {p.firstName ? `${p.firstName}, your free card is ready` : "Your free greeting card is ready"}
      </Heading>
      <Text style={{ fontSize: 15, color: brand.muted, margin: "0 0 18px", textAlign: "center" }}>
        Thank you for your order. As a gift, make a greeting card with your portrait and send it to someone you love. It&apos;s free.
      </Text>
      {p.portraitImageUrl && (
        <Link href={p.linkUrl}>
          <Img src={p.portraitImageUrl} alt="Your portrait" width={280} style={{ width: 280, maxWidth: "100%", borderRadius: 12, margin: "0 auto" }} />
        </Link>
      )}
      <Section style={{ textAlign: "center", paddingTop: 20 }}>
        <Button href={p.linkUrl} style={button}>
          Make my free card
        </Button>
        <Text style={{ fontSize: 13, color: brand.muted, margin: "10px 0 0" }}>
          The button signs you in, no password needed. It works for {p.validDays} days.
        </Text>
      </Section>
    </EmailLayout>
  );
}

GiftOffer.PreviewProps = {
  appUrl: "https://my.magicportraits.ai",
  firstName: "Sam",
  orderName: "#1001",
  portraitImageUrl: "https://my.magicportraits.ai/theme-placeholders/thumbs/birthday-confetti.jpg",
  linkUrl: "https://my.magicportraits.ai/g/example",
  validDays: 30,
  unsubscribeUrl: "https://my.magicportraits.ai/gift/unsubscribe?o=example",
} satisfies GiftOfferProps;
