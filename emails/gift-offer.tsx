import { Button, Heading, Img, Link, Text } from "@react-email/components";
import { Badge, EmailLayout, Step, button, h1, lead, small, type EmailFooter } from "./Layout";

export type GiftOfferProps = {
  appUrl: string;
  firstName: string | null;
  orderName: string | null;
  linkUrl: string;
  validDays: number;
  unsubscribeUrl: string;
  footer?: EmailFooter;
};

/** The free gift offer: a one-tap link to make free greeting cards with their portraits. */
export default function GiftOffer(p: GiftOfferProps) {
  return (
    <EmailLayout
      appUrl={p.appUrl}
      footer={p.footer}
      preview="Turn your portrait into a greeting card. Free, as many as you like."
      preferencesUrl={p.unsubscribeUrl}
      note={<>You got this because of your Magic Portraits order{p.orderName ? ` ${p.orderName}` : ""}.</>}
      after={
        <>
          <Step n={1} title="Pick a theme.">
            Birthday, Christmas, New Year and more.
          </Step>
          <Step n={2} title="Add your portrait">
            from any past order.
          </Step>
          <Step n={3} title="Write and send.">
            Email it, download it or share it.
          </Step>
        </>
      }
    >
      <Badge>🎁&nbsp; FREE GIFT UNLOCKED</Badge>
      <Heading as="h1" style={h1}>
        Turn your portrait into a greeting card
      </Heading>
      <Text style={lead}>
        {p.firstName ? `Hi ${p.firstName}, thanks for your order.` : "Thanks for your order."} Pick a theme, add your portrait and a message. We send it, or you share it. Free, as many as you like.
      </Text>
      <Link href={p.linkUrl}>
        <Img src={`${p.appUrl}/email/card-fan.jpg`} alt="Greeting cards with a portrait: Happy Birthday, Merry Christmas and Happy New Year" width={508} style={{ width: "100%", maxWidth: 508, height: "auto", margin: "0 auto 20px" }} />
      </Link>
      <Button href={p.linkUrl} style={button}>
        Create my card ✦
      </Button>
      <Text style={small}>This button is personal to you: no sign-in needed. It works for {p.validDays} days.</Text>
    </EmailLayout>
  );
}

/** "{order}" in the subject setting becomes the order number (e.g. "#1001"). */
export function giftOfferSubject(template: string, orderName: string | null): string {
  return (orderName ? template.replaceAll("{order}", orderName) : template.replaceAll(/\s*\{order\}/g, "")).trim();
}

GiftOffer.PreviewProps = {
  appUrl: "https://my.magicportraits.ai",
  firstName: "Sam",
  orderName: "#1001",
  linkUrl: "https://my.magicportraits.ai/g/example",
  validDays: 30,
  unsubscribeUrl: "https://my.magicportraits.ai/gift/unsubscribe?o=example",
} satisfies GiftOfferProps;
