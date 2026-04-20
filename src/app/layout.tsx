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
  title: "Inklee — booking requests without the DM chaos",
  description:
    "A simple booking request tool for freelance and traveling tattoo artists.",
  metadataBase: new URL("https://inklee.app"),
  openGraph: {
    title: "Inklee — booking requests without the DM chaos",
    description:
      "A clean booking request tool for freelance tattoo artists. Replace chaotic DMs with a structured form and approval flow.",
    url: "https://inklee.app",
    siteName: "Inklee",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Inklee — booking requests without the DM chaos",
    description: "A clean booking request tool for freelance tattoo artists.",
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
