import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import SectionNav from "@/components/section-nav";
import GrowthSectionNav from "./growth-section-nav";

const SECTIONS = [
  { label: "Overview", href: "/admin/growth" },
  { label: "Acquisition", href: "/admin/growth/acquisition" },
  { label: "Search", href: "/admin/growth/search" },
  { label: "Activation", href: "/admin/growth/activation" },
  { label: "Engagement", href: "/admin/growth/engagement" },
  { label: "Retention", href: "/admin/growth/retention" },
  { label: "Features", href: "/admin/growth/features" },
  { label: "Bookings", href: "/admin/growth/bookings" },
  { label: "Email", href: "/admin/growth/email" },
  { label: "Users", href: "/admin/growth/users" },
  { label: "Insights", href: "/admin/growth/insights" },
  { label: "Definitions", href: "/admin/growth/definitions" },
  { label: "Settings", href: "/admin/growth/settings" },
];

export default async function GrowthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense-in-depth on top of admin/layout.tsx; each page also self-guards.
  await requireAdmin();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>{" "}
            / Growth cockpit
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Growth cockpit</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Internal. Built on canonical product data; definitions on the
            definitions tab.
          </p>
        </div>
        <Suspense fallback={<SectionNav items={SECTIONS} />}>
          <GrowthSectionNav items={SECTIONS} />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
