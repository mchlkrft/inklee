import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, relativeTime } from "@/lib/format";
import StatusActions from "./status-actions";
import StatusBadge from "@/components/status-badge";
import AnnotatedImageGallery from "./annotated-image-gallery";
import CommunicationSidebar from "./communication-sidebar";
import type { Annotation } from "@/lib/annotations";
import type { CustomAnswerSnapshot } from "@/lib/custom-fields";
import { formatCustomAnswer } from "@/lib/custom-fields";
import { bookingModeFromRequest, bookingModeLabel } from "@/lib/booking-domain";
import { isDateKeyOnOrAfter, todayInTimeZone } from "@/lib/date-utils";
import { formatSlotDisplay } from "@/lib/timezone";

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
    .select(
      "*, booking_images(storage_path, annotations), flash_items(id, title, slug, status), trips(title), slots(starts_at, duration_minutes), profiles!artist_id(timezone)",
    )
    .eq("id", id)
    .eq("artist_id", user!.id)
    .single();

  if (!booking) notFound();

  const fd = booking.form_data as Record<string, unknown> | null;
  const customAnswers =
    (fd?.custom_answers as CustomAnswerSnapshot[] | undefined) ?? [];
  const bookingMode = bookingModeFromRequest({ slot_id: booking.slot_id });
  const artistProfile = Array.isArray(booking.profiles)
    ? booking.profiles[0]
    : booking.profiles;
  const artistTimeZone =
    (artistProfile as { timezone?: string } | null)?.timezone ??
    "Europe/Berlin";
  const slotInfo =
    booking.slot_id && booking.slots
      ? formatSlotDisplay(
          (booking.slots as { starts_at: string }).starts_at,
          (booking.slots as { duration_minutes: number }).duration_minutes,
          artistTimeZone,
        )
      : null;
  const tripTitle = Array.isArray(booking.trips)
    ? booking.trips[0]?.title
    : ((booking.trips as { title?: string } | null)?.title ?? null);

  const { data: reminderLog } = await supabase
    .from("audit_log")
    .select("action, timestamp, details")
    .eq("booking_id", id)
    .order("timestamp", { ascending: false })
    .limit(30);

  type ImageRow = { storage_path: string; annotations: unknown };
  const imagesWithUrls: { url: string; annotations: Annotation[] | null }[] =
    [];
  for (const img of (booking.booking_images as ImageRow[]) ?? []) {
    const { data } = await supabase.storage
      .from("bookings")
      .createSignedUrl(img.storage_path, 3600);
    if (data?.signedUrl) {
      imagesWithUrls.push({
        url: data.signedUrl,
        annotations: Array.isArray(img.annotations)
          ? (img.annotations as Annotation[])
          : null,
      });
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href="/bookings/overview"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>&larr;</span> Booking Overview
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            @{booking.customer_handle}
          </h1>
          <StatusBadge status={booking.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Submitted {relativeTime(booking.created_at)}
          {bookingModeLabel(bookingMode)
            ? ` · ${bookingModeLabel(bookingMode)}`
            : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="overflow-hidden rounded-[20px] border border-border divide-y divide-border">
            {booking.flash_items && (
              <div className="flex px-4 py-3 gap-4">
                <span className="text-sm text-muted-foreground w-32 shrink-0">
                  Flash item
                </span>
                <Link
                  href={`/flash/items/${(booking.flash_items as { id: string }).id}`}
                  className="text-sm text-foreground underline underline-offset-4 hover:opacity-80"
                >
                  {(booking.flash_items as { title: string }).title}
                </Link>
              </div>
            )}
            <Row label="Instagram" value={`@${booking.customer_handle}`} />
            <Row label="Booking type" value={bookingModeLabel(bookingMode)} />
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
            {slotInfo && (
              <Row
                label="Slot time"
                value={`${slotInfo.date} · ${slotInfo.time}`}
              />
            )}
            {tripTitle && <Row label="Location" value={tripTitle} />}
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
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Description
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {fd.description as string}
              </p>
            </div>
          )}

          {imagesWithUrls.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Reference images
                <span className="ml-1.5 normal-case tracking-normal opacity-70">
                  ({imagesWithUrls.length})
                </span>
              </p>
              <AnnotatedImageGallery images={imagesWithUrls} />
            </div>
          )}
        </div>

        <div className="space-y-6">
          <StatusActions booking={{ id: booking.id, status: booking.status }} />

          {booking.deposit_amount && (
            <div className="rounded-[20px] border border-border p-5 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.14em]">
                Deposit
              </p>
              <p className="text-base text-foreground font-medium">
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

          <div className="overflow-hidden rounded-[20px] border border-border divide-y divide-border text-sm">
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

          <div className="rounded-[20px] border border-border p-5">
            <CommunicationSidebar
              bookingId={booking.id}
              status={booking.status}
              hasDepositDueDate={!!booking.deposit_due_at}
              hasMagicLink={!!booking.customer_token_hash}
              hasUpcomingDate={
                !!booking.preferred_date &&
                isDateKeyOnOrAfter(
                  booking.preferred_date,
                  todayInTimeZone(artistTimeZone),
                )
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
