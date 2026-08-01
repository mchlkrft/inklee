import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPaymentRequestsForArtist } from "@/lib/server/appointment-payment-read";
import { PaymentRequestsList } from "./payment-requests-list";

// The artist's payment-requests overview (P9 artist UI, slice 2a). Read-only
// list built on the shared read layer; per-row send/cancel run the server
// actions. Creating and revising a request (which need a form + the booking or
// project context) arrive in a later slice; this is the entry point that finally
// lets an artist SEE the requests the cores could already create.
export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (artist) layout guards auth; this is a defensive fallback only.
  if (!user) return null;

  const requests = await listPaymentRequestsForArtist(supabase, user.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Structured payment requests for appointments and projects. Send a
            draft to give your client a secure payment link, or cancel one you
            no longer need.
          </p>
        </div>
        <Link
          href="/bookings/payments/new"
          className="shrink-0 rounded-lg bg-brand-mustard px-4 py-2 text-sm font-semibold text-brand-charcoal transition-opacity hover:opacity-90"
        >
          New request
        </Link>
      </header>
      <PaymentRequestsList requests={requests} />
    </div>
  );
}
