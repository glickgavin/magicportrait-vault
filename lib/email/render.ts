import "server-only";
import { render } from "@react-email/render";
import CardDelivery, { type CardDeliveryProps } from "@/emails/card-delivery";
import CardScheduled, { type CardScheduledProps } from "@/emails/card-scheduled";
import GiftOffer, { giftOfferSubject, type GiftOfferProps } from "@/emails/gift-offer";
import SigninCode from "@/emails/signin-code";
import SigninLink from "@/emails/signin-link";

export const TEMPLATES = {
  "card-delivery": { component: CardDelivery, subject: (p: CardDeliveryProps) => `${p.fromName} sent you a ${p.themeName} card` },
  "card-scheduled": { component: CardScheduled, subject: (p: CardScheduledProps) => `Your card to ${p.toName} is scheduled` },
  "gift-offer": { component: GiftOffer, subject: (p: GiftOfferProps) => giftOfferSubject("A free gift with your order {order}", p.orderName) },
  "signin-code": { component: SigninCode, subject: () => "Your My Magic Portraits code" },
  "signin-link": { component: SigninLink, subject: () => "Your link to My Magic Portraits" },
} as const;

export type TemplateName = keyof typeof TEMPLATES;
type PropsOf<N extends TemplateName> = Parameters<(typeof TEMPLATES)[N]["component"]>[0];

export async function renderEmail<N extends TemplateName>(name: N, props: PropsOf<N>): Promise<{ subject: string; html: string; text: string }> {
  const t = TEMPLATES[name] as unknown as { component: (p: PropsOf<N>) => React.ReactElement; subject: (p: PropsOf<N>) => string };
  const el = t.component(props);
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { subject: t.subject(props), html, text };
}

export function previewProps<N extends TemplateName>(name: N): PropsOf<N> {
  return (TEMPLATES[name].component as unknown as { PreviewProps: PropsOf<N> }).PreviewProps;
}
