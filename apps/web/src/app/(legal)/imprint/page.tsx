import { getLegalDoc } from "@/lib/legal/documents";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export const dynamic = "force-static";

export const metadata = {
  title: "Imprint",
  description: "Legal notice for Inklee OÜ.",
};

export default function ImprintPage() {
  return <LegalPageLayout doc={getLegalDoc("imprint")} />;
}
