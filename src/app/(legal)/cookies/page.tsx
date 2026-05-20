import { getLegalDoc } from "@/lib/legal/documents";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export const dynamic = "force-static";

export const metadata = {
  title: "Cookie Policy",
  description:
    "How Inklee uses cookies and similar storage technologies on inklee.app.",
};

export default function CookiesPage() {
  return <LegalPageLayout doc={getLegalDoc("cookies")} />;
}
