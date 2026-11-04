import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, brand } from "./Layout";

export type SigninCodeProps = { appUrl: string; code: string; minutes: number };

/** The 6-digit code. Rendered with code "{{ .Token }}" into supabase/templates/signin-code.html for Supabase Auth. */
export default function SigninCode(p: SigninCodeProps) {
  return (
    <EmailLayout appUrl={p.appUrl} preview={`Your sign-in code is ${p.code}`}>
      <Text style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: brand.pink, margin: 0 }}>My Magic Portraits</Text>
      <Heading as="h1" style={{ fontSize: 24, margin: "10px 0 6px" }}>
        Your sign-in code
      </Heading>
      <Text style={{ fontSize: 16, color: brand.muted, margin: 0 }}>Enter this code to sign in. It works for {p.minutes} minutes.</Text>
      <Section style={{ padding: "22px 0" }}>
        <Text style={{ fontSize: 40, fontWeight: 800, letterSpacing: 10, textAlign: "center", backgroundColor: brand.tint, borderRadius: 14, padding: "18px 0", margin: 0 }}>{p.code}</Text>
      </Section>
      <Text style={{ fontSize: 13, color: brand.muted, margin: 0 }}>If you didn&apos;t ask for this, you can ignore this email. Someone may have typed your email by mistake.</Text>
    </EmailLayout>
  );
}

SigninCode.PreviewProps = { appUrl: "https://my.magicportraits.ai", code: "123456", minutes: 10 } satisfies SigninCodeProps;
