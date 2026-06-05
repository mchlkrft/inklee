import { getLegalDoc } from "@/lib/legal/documents";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export const dynamic = "force-static";

export const metadata = {
  title: "Subprocessor List",
  description:
    "Third-party processors Inklee uses, their purpose, data categories, and region/transfer mechanism.",
};

export default function SubprocessorsPage() {
  return <LegalPageLayout doc={getLegalDoc("subprocessors")} />;
}
