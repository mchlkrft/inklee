import { getLegalDoc } from "@/lib/legal/documents";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export const dynamic = "force-static";

export const metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Inklee.",
};

export default function TermsPage() {
  return <LegalPageLayout doc={getLegalDoc("terms")} />;
}
