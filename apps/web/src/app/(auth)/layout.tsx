import type { Metadata } from "next";
import Link from "next/link";
import RandomizedLogo from "@/components/randomized-logo";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-6">
      <Link href="/" className="flex justify-center" aria-label="inklee home">
        <RandomizedLogo height={22} />
      </Link>
      <div className="w-full max-w-sm rounded-[20px] border border-border p-7">
        {children}
      </div>
    </div>
  );
}
