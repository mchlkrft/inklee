import { getLegalDoc } from "@/lib/legal/documents";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export const dynamic = "force-static";

export const metadata = {
  title: "Data Processing Agreement",
  description:
    "The Article 28 GDPR data processing agreement between Inklee and Artists.",
};

export default function DpaPage() {
  return <LegalPageLayout doc={getLegalDoc("dpa")} />;
}
