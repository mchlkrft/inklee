import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Check, X } from "lucide-react";

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
  const { slug, edited, cancelled, email } = await searchParams;

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-charcoal px-6">
      <div className="w-full max-w-sm space-y-7 text-center">
        {/* Branded status mark — mustard for success, muted for a cancellation. */}
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            isCancelled ? "bg-brand-bone/10" : "bg-brand-mustard"
          }`}
        >
          {isCancelled ? (
            <X className="h-7 w-7 text-brand-bone/60" strokeWidth={2.5} />
          ) : (
            <Check className="h-9 w-9 text-brand-charcoal" strokeWidth={3.5} />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-brand-bone">
            {headline}
          </h1>
          <p className="text-sm leading-relaxed text-brand-bone/70">{body}</p>
        </div>

        {slug && !isCancelled && (
          <Link
            href={`/${slug}`}
            className="inline-block text-sm text-brand-bone/70 underline underline-offset-4 transition-colors hover:text-brand-bone"
          >
            Back to {artistName ?? slug}
          </Link>
        )}
      </div>
    </div>
  );
}
