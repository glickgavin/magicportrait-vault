import { Button, Heading, Img, Text } from "@react-email/components";
import { Badge, EmailLayout, button, h1, lead, small, type EmailFooter } from "./Layout";

export type StorePictureProps = {
  appUrl: string;
  /** The one-tap link (/g/<token>): signs them in and opens the product with their picture. */
  link: string;
  days: number;
  /** The pet's name, or null. Private: only ever in this email to the address they gave. */
  name: string | null;
  productTitle: string;
  /** Imagen's public picture URL, as on order lines. */
  pictureUrl: string;
  subjectTemplate?: string;
  footer?: EmailFooter;
};

export function storePictureSubject(p: Pick<StorePictureProps, "name" | "subjectTemplate">): string {
  const tpl = p.subjectTemplate ?? "{name}'s picture is ready";
  return p.name ? tpl.replaceAll("{name}", p.name) : "Your picture is ready";
}

/** "Your picture is ready" (docs/open-store.md › Asking for their email while we paint): the one they asked for. */
export default function StorePicture(p: StorePictureProps) {
  const product = p.productTitle.replace(/^Magic\s+/i, "").replace(/\s+with Photo$/i, "").toLowerCase();
  return (
    <EmailLayout appUrl={p.appUrl} footer={p.footer} preview={storePictureSubject(p)}>
      <Badge>✨&nbsp; MAGIC STORE</Badge>
      <Heading as="h1" style={h1}>
        {storePictureSubject(p)}
      </Heading>
      <Img src={p.pictureUrl} alt={p.name ? `${p.name}'s picture` : "Your picture"} width={420} style={{ width: "100%", maxWidth: 420, height: "auto", borderRadius: 16, margin: "0 auto 20px" }} />
      <Text style={lead}>Here it is, as promised. Open it on any device to see it on your {product}, pick your favourite and order it.</Text>
      <Button href={p.link} style={button}>
        See it on your {product}
      </Button>
      <Text style={small}>The link works for {p.days} days and signs you in, so please don&apos;t forward this email.</Text>
    </EmailLayout>
  );
}

StorePicture.PreviewProps = {
  appUrl: "https://my.magicportraits.ai",
  link: "https://my.magicportraits.ai/g/example",
  days: 30,
  name: "Teddy",
  productTitle: "Magic Pillow with Photo",
  pictureUrl: "https://my.magicportraits.ai/shop-samples/scenes/admiral-teddy.jpg",
} satisfies StorePictureProps;
