// Unit tests always use fixtures and the local Supabase stack, never real services.
import { appTestEnv } from "../scripts/local-env.mjs";

const local = appTestEnv(3100);
for (const [k, v] of Object.entries(local)) {
  if (k === "APP_URL") process.env[k] = v;
  else process.env[k] ??= v;
}
process.env.DATA_SOURCE = "fixtures";
process.env.EMAIL_PROVIDER = "fixtures";
process.env.KLAVIYO_PROVIDER = "fixtures";
