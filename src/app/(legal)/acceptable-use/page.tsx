import { getLegalDoc } from "@/lib/legal/documents";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export const dynamic = "force-static";

export const metadata = {
  title: "Acceptable Use Policy",
  description: "What you may and may not do when using Inklee.",
};

export default function AcceptableUsePage() {
  return <LegalPageLayout doc={getLegalDoc("acceptable-use")} />;
}
