import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <Link href="/" className="flex justify-center" aria-label="inklee home">
          <SiteLogo height={24} />
        </Link>
        {children}
      </div>
    </div>
  );
}
