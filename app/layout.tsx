import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, DM_Serif_Display, League_Gothic } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";
import { Intercom } from "@/components/Intercom";
import { t } from "@/lib/i18n";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], variable: "--font-dmserif", display: "swap" });
const league = League_Gothic({ subsets: ["latin"], weight: ["400"], variable: "--font-league", display: "swap" });

export const metadata: Metadata = {
  title: { default: t("app.name"), template: `%s · ${t("app.titleSuffix")}` },
  description: t("home.cardsBody"),
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
  metadataBase: new URL(process.env.APP_URL || "https://my.magicportraits.ai"),
};

export const viewport: Viewport = {
  themeColor: "#F24BDF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${dmSerif.variable} ${league.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
          {t("ui.skip")}
        </a>
        <PostHogProvider>{children}</PostHogProvider>
        <Intercom />
      </body>
    </html>
  );
}
