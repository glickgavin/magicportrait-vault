import { Heading, Section, Text } from "@react-email/components";
import { Badge, EmailLayout, brand, h1, lead, small, type EmailFooter } from "./Layout";

export type SigninCodeProps = { appUrl: string; code: string; minutes: number; footer?: EmailFooter };

/** The 6-digit code. Rendered with code "{{ .Token }}" into supabase/templates/signin-code.html for Supabase Auth. */
export default function SigninCode(p: SigninCodeProps) {
  return (
    <EmailLayout appUrl={p.appUrl} footer={p.footer} preview={`Your sign-in code is ${p.code}`}>
      <Badge>🔒&nbsp; MY MAGIC PORTRAITS</Badge>
      <Heading as="h1" style={h1}>
        Your sign-in code
      </Heading>
      <Text style={lead}>Enter this code to sign in. It works for {p.minutes} minutes.</Text>
      <Section style={{ padding: "0 0 4px" }}>
        <Text style={{ fontSize: 40, fontWeight: 800, letterSpacing: 10, textAlign: "center", backgroundColor: brand.tint, color: brand.ink, borderRadius: 16, padding: "18px 0", margin: 0 }}>{p.code}</Text>
      </Section>
      <Text style={small}>If you didn&apos;t ask for this, you can ignore this email. Someone may have typed your email by mistake.</Text>
    </EmailLayout>
  );
}

SigninCode.PreviewProps = { appUrl: "https://my.magicportraits.ai", code: "123456", minutes: 10 } satisfies SigninCodeProps;
