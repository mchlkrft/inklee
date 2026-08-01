import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentRequestForArtist } from "@/lib/server/appointment-payment-read";
import { RevisePaymentRequestForm } from "./revise-payment-request-form";

// Revise a sent request (P9 artist UI, Track A tail). The page loads the
// EXISTING request (lines + collects) so the form starts from what the client
// was last shown, not a blank slate; `revisePaymentRequestCore` is what
// actually decides whether a revision is allowed from this request's current
// status, so this page does not re-derive that gate, only 404s when the
// request does not exist / is not this artist's (RLS + the read layer's own
// `artist_id` filter both cover that).
export const metadata = { title: "Revise payment request" };

export default async function RevisePaymentRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const request = await getPaymentRequestForArtist(supabase, user.id, id);
  if (!request) notFound();

  // `collects` is frozen-set metadata the shared read layer does not expose
  // (it returns the lines + status view every other action here uses); read it
  // directly, scoped the same way (RLS + the explicit artist_id filter).
  const { data: collectsRow } = await supabase
    .from("payment_requests")
    .select("collects")
    .eq("artist_id", user.id)
    .eq("id", id)
    .maybeSingle();
  const currentCollects = (collectsRow?.collects as string | null) ?? "deposit";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <Link
        href={`/bookings/payments/${id}`}
        className="text-sm text-muted-foreground underline"
      >
        Back to payment request
      </Link>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          Revise payment request
        </h1>
        <p className="text-sm text-muted-foreground">
          This starts a new version of the request. The current one stays live
          for your client until you send this revision.
        </p>
      </header>

      <RevisePaymentRequestForm
        requestId={id}
        initialCollects={currentCollects}
        initialLines={request.lines.map((line) => ({
          name: line.name,
          amount: (line.lineTotalMinor / 100).toFixed(2),
          classification:
            line.classification === "additional_service"
              ? "additional_service"
              : "tattoo_service",
        }))}
      />
    </div>
  );
}
