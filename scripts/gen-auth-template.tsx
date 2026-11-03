// Renders emails/signin-code.tsx with the code "{{ .Token }}" into supabase/templates/signin-code.html,
// the template Supabase Auth sends (local config and `pnpm auth:configure`). Run: pnpm exec tsx scripts/gen-auth-template.tsx
import { writeFileSync } from "node:fs";
import { render } from "@react-email/render";
import SigninCode from "../emails/signin-code";

const html = await render(SigninCode({ appUrl: "https://my.magicportraits.ai", code: "{{ .Token }}", minutes: 10 }));
if (!html.includes("{{ .Token }}")) throw new Error("token placeholder lost");
writeFileSync(new URL("../supabase/templates/signin-code.html", import.meta.url), html);
console.log("wrote supabase/templates/signin-code.html");
