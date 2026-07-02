import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import AnalyticsBootstrap from "@/components/analytics-bootstrap";
import CookieBanner from "@/components/cookie-banner";
import JsonLd from "@/components/seo/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/jsonld";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Inklee · Tattoo booking tool for artists",
  description:
    "Turn Instagram DMs into structured tattoo requests, approvals, deposits, and bookings without losing clients in the scroll.",
  metadataBase: new URL("https://inklee.app"),
  alternates: {
    canonical: "/",
  },
  // Explicit icon declarations. The App Router auto-serves favicon.ico/icon.svg
  // from app/, but Google's SERP favicon crawler wants an explicit <link rel> in
  // the homepage <head> pointing at a square raster >=48px. icon.png is the
  // brand spiderweb at 96px (a 48 multiple). Without this Google kept showing its
  // cached Vercel-default favicon. A favicon refresh in search results can still
  // lag days to weeks after deploy; request a reindex of the homepage in GSC.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "96x96" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Tattoo booking requests without DM chaos",
    description:
      "Inklee helps freelance and traveling tattoo artists turn Instagram inquiries into organized booking requests.",
    url: "https://inklee.app",
    siteName: "Inklee",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Tattoo booking requests without DM chaos",
    description:
      "Inklee helps freelance and traveling tattoo artists turn Instagram inquiries into organized booking requests.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/* Brand entity, emitted on every page so any deep SERP entry point
            carries the Organization + WebSite schema (not just the home page). */}
        <JsonLd data={organizationSchema()} id="ld-organization" />
        <JsonLd data={websiteSchema()} id="ld-website" />
        {/* Mobile FAB scroll-state tracker. Sets html[data-scrolled] = "1" once
            the visitor has scrolled past 60px, otherwise "0". Lives in the root
            layout (not the nav component) so the listener survives client-side
            navigation — script tags rendered as children of a route component do
            not re-execute on SPA navs. CSS in globals.css drives the FAB scale
            on mobile based on this attribute; the default state is small, so
            even if this script ever fails to fire the FAB still shrinks. */}
        <Script id="fab-scroll-state" strategy="beforeInteractive">
          {`(function(){function s(){document.documentElement.dataset.scrolled=window.scrollY>60?"1":"0"}s();window.addEventListener("scroll",s,{passive:true})})();`}
        </Script>
        {children}
        <AnalyticsBootstrap />
        <CookieBanner />
        <Script
          defer
          data-domain="inklee.app"
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
