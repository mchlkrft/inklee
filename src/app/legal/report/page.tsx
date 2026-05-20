import Link from "next/link";
import { ReportForm } from "./report-form";

export const metadata = {
  title: "Report content",
  description:
    "Submit a notice about content on Inklee under the EU Digital Services Act notice-and-action mechanism (Article 16).",
};

export default function ReportContentPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex-1 w-full max-w-2xl space-y-8 px-6 py-12">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">
              Report content
            </h1>
            <p className="text-xs">
              EU Digital Services Act — notice and action (Article 16)
            </p>
          </div>

          <p>
            Use this form to report content on Inklee that you believe is
            unlawful or that violates our Acceptable Use Policy. You can also
            send a report by email to{" "}
            <a
              href="mailto:support@inklee.app"
              className="text-foreground underline underline-offset-4"
            >
              support@inklee.app
            </a>
            . We confirm receipt of every report and respond within a reasonable
            time.
          </p>

          <ReportForm />

          <footer className="space-y-3 border-t border-border pt-6 text-xs">
            <p>
              See also our{" "}
              <Link
                href="/acceptable-use"
                className="text-foreground underline underline-offset-4"
              >
                Acceptable Use Policy
              </Link>
              ,{" "}
              <Link
                href="/imprint"
                className="text-foreground underline underline-offset-4"
              >
                Imprint
              </Link>
              , and{" "}
              <Link
                href="/privacy"
                className="text-foreground underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
