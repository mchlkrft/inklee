import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CheckCircle } from "lucide-react";

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    slug?: string;
    edited?: string;
    cancelled?: string;
  }>;
}) {
  const { id, slug, edited, cancelled } = await searchParams;

  let artistName: string | null = null;
  if (slug) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("slug", slug)
      .single();
    artistName = data?.display_name ?? null;
  }

  const firstName = artistName?.split(" ")[0] ?? null;

  const isEdited = edited === "1";
  const isCancelled = cancelled === "1";

  const headline = isCancelled
    ? "request cancelled"
    : isEdited
      ? "changes saved"
      : "request sent";

  const body = isCancelled
    ? "your booking request has been cancelled. the artist has been notified."
    : isEdited
      ? "your changes have been saved. a new confirmation link has been sent to your email."
      : firstName
        ? `got it — ${firstName} will review your request and get back to you. check your email for a confirmation.`
        : "your request is in. the artist will get back to you. check your email for a confirmation.";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <CheckCircle
          className={`mx-auto h-10 w-10 ${isCancelled ? "text-muted-foreground" : "text-green-500"}`}
          strokeWidth={1.5}
        />

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">{headline}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {body}
          </p>
        </div>

        {id && (
          <p className="text-xs text-muted-foreground font-mono">
            ref: {id.slice(0, 8)}
          </p>
        )}

        {slug && !isCancelled && (
          <Link
            href={`/${slug}`}
            className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            back to {artistName ?? slug}
          </Link>
        )}
      </div>
    </div>
  );
}
