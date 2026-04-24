import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, relativeTime } from "@/lib/format";
import StatusActions from "./status-actions";
import ImageLightbox from "./image-lightbox";
import CommunicationSidebar from "./communication-sidebar";
import type { CustomAnswerSnapshot } from "@/lib/custom-fields";
import { formatCustomAnswer } from "@/lib/custom-fields";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("*, booking_images(storage_path)")
    .eq("id", id)
    .eq("artist_id", user!.id)
    .single();

  if (!booking) notFound();

  const fd = booking.form_data as Record<string, unknown> | null;
  const customAnswers =
    (fd?.custom_answers as CustomAnswerSnapshot[] | undefined) ?? [];

  const { data: reminderLog } = await supabase
    .from("audit_log")
    .select("action, timestamp, details")
    .eq("booking_id", id)
    .order("timestamp", { ascending: false })
    .limit(30);

  const signedUrls: string[] = [];
  for (const img of booking.booking_images ?? []) {
    const { data } = await supabase.storage
      .from("bookings")
      .createSignedUrl(img.storage_path, 3600);
    if (data?.signedUrl) signedUrls.push(data.signedUrl);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/bookings/requests"
          className="hover:text-foreground transition-colors"
        >
          Requests
        </Link>
        <span>/</span>
        <span className="text-foreground">@{booking.customer_handle}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-md border border-border divide-y divide-border">
            <Row label="Instagram" value={`@${booking.customer_handle}`} />
            <Row label="Email" value={booking.customer_email ?? "-"} />
            <Row label="Placement" value={(fd?.placement as string) ?? "-"} />
            <Row label="Size" value={(fd?.size as string) ?? "-"} />
            <Row
              label="Preferred date"
              value={
                booking.preferred_date
                  ? formatDate(booking.preferred_date)
                  : "-"
              }
            />
            {typeof fd?.reference_link === "string" && (
              <div className="flex px-4 py-3 gap-4">
                <span className="text-sm text-muted-foreground w-32 shrink-0">
                  Reference
                </span>
                <a
                  href={fd.reference_link as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground underline underline-offset-4 break-all"
                >
                  {fd.reference_link as string}
                </a>
              </div>
            )}
            {customAnswers.map((ans) => (
              <Row
                key={ans.key}
                label={ans.label}
                value={formatCustomAnswer(ans)}
              />
            ))}
          </div>

          {typeof fd?.description === "string" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {fd.description as string}
              </p>
            </div>
          )}

          {signedUrls.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Reference images ({signedUrls.length})
              </p>
              <ImageLightbox urls={signedUrls} />
            </div>
          )}
        </div>

        <div className="space-y-6">
          <StatusActions booking={{ id: booking.id, status: booking.status }} />

          {booking.deposit_amount && (
            <div className="rounded-md border border-border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Deposit
              </p>
              <p className="text-sm text-foreground font-medium">
                EUR {Number(booking.deposit_amount).toFixed(2)}
              </p>
              {booking.deposit_due_at && (
                <p className="text-xs text-muted-foreground">
                  Due {formatDate(booking.deposit_due_at)}
                </p>
              )}
              {booking.deposit_note && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {booking.deposit_note}
                </p>
              )}
            </div>
          )}

          <div className="rounded-md border border-border divide-y divide-border text-sm">
            <Row label="Submitted" value={relativeTime(booking.created_at)} />
            {booking.decided_at && (
              <Row label="Decided" value={relativeTime(booking.decided_at)} />
            )}
            <Row
              label="Magic link"
              value={booking.customer_token_hash ? "Active" : "None"}
            />
            <Row label="Origin" value={booking.origin.replace("_", " ")} />
          </div>

          <div className="rounded-md border border-border p-4">
            <CommunicationSidebar
              bookingId={booking.id}
              status={booking.status}
              hasDepositDueDate={!!booking.deposit_due_at}
              hasMagicLink={!!booking.customer_token_hash}
              hasUpcomingDate={
                !!booking.preferred_date &&
                booking.preferred_date >= new Date().toISOString().split("T")[0]
              }
              log={(reminderLog ?? []).map((e) => ({
                action: e.action,
                timestamp: e.timestamp,
                details: (e.details ?? {}) as Record<string, unknown>,
              }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex px-4 py-3 gap-4">
      <span className="text-sm text-muted-foreground w-32 shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
