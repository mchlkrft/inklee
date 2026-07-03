import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-guard";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense-in-depth: every admin page also calls requireAdmin()/getAdminId()
  // itself. This layout-level guard exists so a future admin page added
  // without its own guard is still never exposed to a non-admin.
  await requireAdmin();
  return <>{children}</>;
}
