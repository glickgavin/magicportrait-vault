import { afterEach, describe, expect, it } from "vitest";
import { setSetting } from "@/lib/settings";
import { testSignInAllowed } from "@/lib/auth/test-signin";
import { POST } from "@/app/api/auth/test-signin/route";

const env = process.env.VERCEL_ENV;
const req = (body: unknown) => new Request("http://localhost/api/auth/test-signin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("test sign-in", () => {
  afterEach(async () => {
    process.env.VERCEL_ENV = env;
    await setSetting("auth.test_signin_enabled", false, "test");
  });

  it("is off by default and the route 404s", async () => {
    expect(await testSignInAllowed()).toBe(false);
    expect((await POST(req({ email: "sam@example.com" }))).status).toBe(404);
  });

  it("works off-production when the setting is on", async () => {
    process.env.VERCEL_ENV = "preview";
    await setSetting("auth.test_signin_enabled", true, "test");
    expect(await testSignInAllowed()).toBe(true);
  });

  it("never works on the production deployment, even with the setting on", async () => {
    process.env.VERCEL_ENV = "production";
    await setSetting("auth.test_signin_enabled", true, "test");
    expect(await testSignInAllowed()).toBe(false);
    expect((await POST(req({ email: "sam@example.com" }))).status).toBe(404);
  });

  it("rejects a bad email", async () => {
    process.env.VERCEL_ENV = "preview";
    await setSetting("auth.test_signin_enabled", true, "test");
    expect((await POST(req({ email: "nope" }))).status).toBe(400);
  });
});
