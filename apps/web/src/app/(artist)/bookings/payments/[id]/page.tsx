import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentRequestForArtist } from "@/lib/server/appointment-payment-read";
import { RefundControl } from "./refund-control";

// Statuses from which a refund can be initiated (mirrors the refund core's
// REFUNDABLE_STATUSES). The core re-validates, so this only decides visibility.
const REFUNDABLE = new Set(["paid", "partially_paid", "partially_refunded"]);

// Per-request detail (P9 artist UI, slice 2b-i). Read-only view of one payment
// request and its lines, on the shared read layer. This is the surface the
// revise / refund actions attach to in the next sub-slices; for now it lets an
// artist see exactly what a request contains and its state.
export const metadata = { title: "Payment request" };

function formatAmount(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function statusLabel(status: string): string {
  const t = status.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function classificationLabel(c: string): string {
  const t = c.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default async function PaymentRequestDetailPage({
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <Link
        href="/bookings/payments"
        className="text-sm text-muted-foreground underline"
      >
        Back to payments
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          {formatAmount(request.totalMinor, request.currency)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {request.subject === "appointment" ? "Appointment" : "Project"}{" "}
          payment request · {statusLabel(request.status)}
          {request.revision > 1 ? ` (revision ${request.revision})` : ""}
          {request.linkSent ? " · client link sent" : ""}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Line items</h2>
        {request.lines.length === 0 ? (
          <p className="rounded-[14px] border border-border px-4 py-4 text-sm text-muted-foreground">
            No line items yet. Add them when you build the request.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-[14px] border border-border">
            {request.lines.map((line) => (
              <li
                key={line.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {line.name}
                    {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {classificationLabel(line.classification)}
                    {line.refundStatus !== "none"
                      ? ` · ${statusLabel(line.refundStatus)}`
                      : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm text-foreground">
                  {formatAmount(line.lineTotalMinor, request.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {REFUNDABLE.has(request.status) && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">Refund</h2>
          <RefundControl requestId={request.id} />
        </section>
      )}
    </div>
  );
}
