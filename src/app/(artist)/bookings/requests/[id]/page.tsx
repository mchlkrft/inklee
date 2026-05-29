import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { formatDate, relativeTime } from "@/lib/format";
import StatusActions from "./status-actions";
import StatusBadge from "@/components/status-badge";
import AnnotatedImageGallery from "./annotated-image-gallery";
import CommunicationSidebar from "./communication-sidebar";
import type { Annotation } from "@/lib/annotations";
import type { CustomAnswerSnapshot } from "@/lib/custom-fields";
import { formatCustomAnswer } from "@/lib/custom-fields";
import { isDateKeyOnOrAfter, todayInTimeZone } from "@/lib/date-utils";
import { formatSlotDisplay } from "@/lib/timezone";
import { parseDepositDefaults, detectStripeMode } from "@/lib/deposit-settings";
import { formatPrice } from "@/lib/goods";
import GoodsPickupButton from "./goods-pickup-button";

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
      "*, booking_images(storage_path, annotations), flash_items(id, title, slug, status), trips(title, trip_legs(starts_on, ends_on, studios(name, city))), slots(starts_at, duration_minutes), profiles!artist_id(timezone, settings)",
    )
    .eq("id", id)
    .eq("artist_id", user!.id)
    .single();

  if (!booking) notFound();

  const fd = booking.form_data as Record<string, unknown> | null;
  const customAnswers =
    (fd?.custom_answers as CustomAnswerSnapshot[] | undefined) ?? [];
  const artistProfile = Array.isArray(booking.profiles)
    ? booking.profiles[0]
    : booking.profiles;
  const artistTimeZone =
    (artistProfile as { timezone?: string } | null)?.timezone ??
    "Europe/Berlin";
  const artistSettings = ((
    artistProfile as { settings?: Record<string, unknown> } | null
  )?.settings ?? {}) as Record<string, unknown>;
  const depositDefaults = parseDepositDefaults(artistSettings.deposit_defaults);
  const stripeMode = detectStripeMode(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );
  const slotInfo =
    booking.slot_id && booking.slots
      ? formatSlotDisplay(
          (booking.slots as { starts_at: string }).starts_at,
          (booking.slots as { duration_minutes: number }).duration_minutes,
          artistTimeZone,
        )
      : null;
  // Location = the studio at the trip stop whose date range contains the
  // booking's preferred date (falls back to the trip title only when that stop
  // has no studio set). No matching stop -> no location row.
  type LegStudio = { name: string; city: string };
  const tripData = (
    Array.isArray(booking.trips) ? booking.trips[0] : booking.trips
  ) as {
    title?: string;
    trip_legs?: {
      starts_on: string;
      ends_on: string;
      studios: LegStudio | LegStudio[] | null;
    }[];
  } | null;
  let locationLabel: string | null = null;
  if (tripData && booking.preferred_date) {
    const date = booking.preferred_date as string;
    const leg = (tripData.trip_legs ?? []).find(
      (l) => l.starts_on <= date && l.ends_on >= date,
    );
    if (leg) {
      const studio = Array.isArray(leg.studios)
        ? (leg.studios[0] ?? null)
        : leg.studios;
      locationLabel = studio?.name ?? tripData.title ?? null;
    }
  }

  const { data: reminderLog } = await supabase
    .from("audit_log")
    .select("action, timestamp, details")
    .eq("booking_id", id)
    .order("timestamp", { ascending: false })
    .limit(30);

  // Attached goods order (Slice 75). Most recent order for this booking.
  const { data: orderRow } = await supabase
    .from("orders")
    .select(
      "id, status, goods_amount, fulfillment_status, order_items(type, title_snapshot, variant_snapshot, quantity, total_amount)",
    )
    .eq("booking_id", id)
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type OrderItemRow = {
    type: string;
    title_snapshot: string;
    variant_snapshot: string | null;
    quantity: number;
    total_amount: string | number;
  };
  const goodsOrder = orderRow as unknown as {
    id: string;
    status: string;
    goods_amount: string | number;
    fulfillment_status: string;
    order_items: OrderItemRow[] | null;
  } | null;
  const goodsItems = (goodsOrder?.order_items ?? []).filter(
    (i) => i.type === "product",
  );

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
          <span aria-hidden>&larr;</span> Bookings
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            @{booking.customer_handle}
          </h1>
          <StatusBadge status={booking.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Submitted {relativeTime(booking.created_at)}
          {booking.origin === "artist_created" ? " · Added by you" : ""}
        </p>
      </div>

      {/* Mobile/tablet: actions sit above the dense detail block so artists */}
      {/* can decide without scrolling. On lg+ they live in the right column. */}
      <div className="lg:hidden">
        <StatusActions
          booking={{ id: booking.id, status: booking.status }}
          depositDefaults={depositDefaults}
          stripeMode={stripeMode}
        />
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
            {locationLabel && <Row label="Location" value={locationLabel} />}
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
          <div className="hidden lg:block">
            <StatusActions
              booking={{ id: booking.id, status: booking.status }}
              depositDefaults={depositDefaults}
              stripeMode={stripeMode}
            />
          </div>

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

          {goodsOrder && goodsItems.length > 0 && (
            <div className="rounded-[20px] border border-border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.14em]">
                  Goods
                </p>
                <span className="text-xs text-muted-foreground">
                  {goodsOrder.fulfillment_status === "picked_up"
                    ? "Picked up"
                    : goodsOrder.status === "paid"
                      ? "Paid · awaiting pickup"
                      : "Pending payment"}
                </span>
              </div>
              <ul className="space-y-1.5">
                {goodsItems.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3 text-sm">
                    <span className="text-foreground">
                      {i.title_snapshot}
                      {i.variant_snapshot ? ` · ${i.variant_snapshot}` : ""}
                      <span className="text-muted-foreground">
                        {" "}
                        ×{i.quantity}
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatPrice(Number(i.total_amount))}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">Goods total</span>
                <span className="font-medium text-foreground">
                  {formatPrice(Number(goodsOrder.goods_amount))}
                </span>
              </div>
              {goodsOrder.status === "paid" &&
                goodsOrder.fulfillment_status === "pending_pickup" && (
                  <GoodsPickupButton orderId={goodsOrder.id} />
                )}
            </div>
          )}

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

          {/* Low-signal metadata (submitted / decided / magic link / origin) */}
          {/* tucked into a collapsible below Communication — rarely needed. */}
          <details className="group overflow-hidden rounded-[20px] border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              Show more details
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="divide-y divide-border border-t border-border text-sm">
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
          </details>
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
