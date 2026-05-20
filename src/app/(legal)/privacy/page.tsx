import { getLegalDoc } from "@/lib/legal/documents";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export const dynamic = "force-static";

export const metadata = {
  title: "Privacy Policy",
  description:
    "How Inklee collects, uses, and protects personal data — GDPR-aligned, EU-hosted.",
};

export default function PrivacyPage() {
  return <LegalPageLayout doc={getLegalDoc("privacy")} />;
}
