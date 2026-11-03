import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db/client";

describe("one-tap session exchange", () => {
  it("works for someone who has never signed in (signup token) and for existing users", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const email = `first-${Date.now()}@example.com`;
    for (let i = 0; i < 2; i++) {
      const g = await db().auth.admin.generateLink({ type: "magiclink", email });
      const v = await anon.auth.verifyOtp({ type: "email", token_hash: g.data!.properties!.hashed_token });
      expect(v.error, `attempt ${i}`).toBeNull();
      expect(v.data.user?.email).toBe(email);
    }
  });
});
