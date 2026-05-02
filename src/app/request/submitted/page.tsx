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
    email?: string;
  }>;
}) {
  const { id, slug, edited, cancelled, email } = await searchParams;

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
  const hasEmail = email !== "0";

  const headline = isCancelled
    ? "Request cancelled"
    : isEdited
      ? "Changes saved"
      : "Request sent";

  const body = isCancelled
    ? "Your booking request has been cancelled. The artist has been notified."
    : isEdited
      ? "Your changes have been saved. A new confirmation link has been sent to your email."
      : firstName
        ? hasEmail
          ? `Got it - ${firstName} will review your request and get back to you. Check your email for a confirmation.`
          : `Got it - ${firstName} will review your request and get back to you.`
        : hasEmail
          ? "Your request is in. The artist will get back to you. Check your email for a confirmation."
          : "Your request is in. The artist will get back to you.";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <CheckCircle
          className={`mx-auto h-10 w-10 ${isCancelled ? "text-muted-foreground" : "text-green-500"}`}
          strokeWidth={1.5}
        />

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">{headline}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>

        {id && (
          <p className="font-mono text-xs text-muted-foreground">
            Ref: {id.slice(0, 8)}
          </p>
        )}

        {slug && !isCancelled && (
          <Link
            href={`/${slug}`}
            className="inline-block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Back to {artistName ?? slug}
          </Link>
        )}
      </div>
    </div>
  );
}
