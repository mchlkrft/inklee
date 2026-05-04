import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import CookieBanner from "@/components/cookie-banner";
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
  title: "Inklee — Tattoo Booking Tool for Artists",
  description:
    "Turn Instagram DMs into structured tattoo requests, approvals, deposits, and bookings without losing clients in the scroll.",
  metadataBase: new URL("https://inklee.app"),
  alternates: {
    canonical: "/",
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
        {children}
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
