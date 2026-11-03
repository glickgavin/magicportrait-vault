import type { NextConfig } from "next";

const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const posthogAssets = posthogHost.replace("://us.i.", "://us-assets.i.").replace("://eu.i.", "://eu-assets.i.");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "postgres", "archiver"],
  outputFileTracingIncludes: {
    "/api/**": ["./assets/fonts/**"],
    "/settings/**": ["./assets/fonts/**"],
  },
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssets}/static/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // noindex everywhere except the sign-in page (SPEC §17)
      { source: "/((?!signin$).*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
