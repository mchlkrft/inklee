import { serviceClient } from "@/lib/supabase/service";
import Link from "next/link";
import crypto from "crypto";
import CustomerPortal from "./customer-portal";
import {
  bookingModeFromRequest,
  bookingModeLabel,
  portalEditSupport,
} from "@/lib/booking-domain";
import type { AddonProductView } from "./addons-checkout";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > 30 * 24 * 60 * 60 * 1000;
}

type PageState =
  | { type: "active"; booking: Parameters<typeof CustomerPortal>[0]["booking"] }
  | { type: "expired" }
  | { type: "used" }
  | { type: "not-found" }
  | { type: "cancelled" };

export default async function RequestPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = hashToken(token);

  const { data: booking } = await serviceClient
    .from("booking_requests")
    .select(
      `
      id, status, created_at, artist_id,
      customer_handle, customer_email,
      preferred_date, form_data,
      slot_id, trip_id, flash_item_id,
      deposit_amount, deposit_due_at, deposit_note,
      deposit_client_secret,
      profiles!artist_id(display_name, timezone)
    `,
    )
    .eq("customer_token_hash", tokenHash)
    .single();

  let state: PageState;

  if (!booking) {
    const { data: auditEntry } = await serviceClient
      .from("audit_log")
      .select("id")
      .eq("action", "token_rotated")
      .filter("details->>old_hash", "eq", tokenHash)
      .limit(1)
      .single();

    state = auditEntry ? { type: "used" } : { type: "not-found" };
  } else if (booking.status === "cancelled") {
    state = { type: "cancelled" };
  } else if (isExpired(booking.created_at)) {
    state = { type: "expired" };
  } else {
    const fd = booking.form_data as Record<string, string> | null;
    const profile = Array.isArray(booking.profiles)
      ? booking.profiles[0]
      : booking.profiles;
    const support = portalEditSupport({
      status: booking.status,
      customerEmail: booking.customer_email,
      preferredDate: booking.preferred_date,
      customerHandle: booking.customer_handle,
      slotId: booking.slot_id,
      tripId: booking.trip_id,
      flashItemId: booking.flash_item_id,
      formData: fd,
    });
    const bookingMode = bookingModeFromRequest({ slot_id: booking.slot_id });

    // Pre-checkout goods: the items the client marked interest in at booking
    // time AND the artist confirmed available on Accept. Opt-in only —
    // AddonsCheckout starts every row at qty 0 so the client actively adds
    // each one; the stepper caps at the originally-marked qty since that's
    // what the artist actually vouched for. No interests + no available rows
    // = no goods section, deposit-only checkout (the strict pre-interests
    // behaviour).
    type ConfirmedInterestRow = {
      product_id: string | null;
      variant_id: string | null;
      title_snapshot: string;
      variant_snapshot: string | null;
      unit_price: string | number | null;
      quantity: number;
    };
    let addonProducts: AddonProductView[] = [];
    if (booking.status === "deposit_pending") {
      const { data: rawInterests } = await serviceClient
        .from("booking_interests")
        .select(
          "product_id, variant_id, title_snapshot, variant_snapshot, unit_price, quantity",
        )
        .eq("booking_id", booking.id)
        .eq("status", "available")
        .order("created_at", { ascending: true });
      // Group by product so the same product carrying multiple variant
      // interests becomes one AddonProductView with each chosen variant —
      // avoids a product-id collision in computeAddonLines at submit time.
      const byProduct = new Map<string, ConfirmedInterestRow[]>();
      for (const r of (rawInterests ?? []) as ConfirmedInterestRow[]) {
        if (!r.product_id) continue;
        const arr = byProduct.get(r.product_id) ?? [];
        arr.push(r);
        byProduct.set(r.product_id, arr);
      }
      addonProducts = Array.from(byProduct.entries()).map(
        ([productId, list]) => {
          const first = list[0];
          const productPrice =
            first.unit_price !== null && first.unit_price !== undefined
              ? Number(first.unit_price)
              : 0;
          const variants = list
            .filter((r) => r.variant_id !== null)
            .map((r) => ({
              id: r.variant_id as string,
              name: r.variant_snapshot ?? "",
              price:
                r.unit_price !== null && r.unit_price !== undefined
                  ? Number(r.unit_price)
                  : productPrice,
              stock: r.quantity, // cap stepper at the artist-confirmed qty
            }));
          return {
            id: productId,
            title: first.title_snapshot,
            imageUrl: null,
            price: productPrice,
            stock: variants.length === 0 ? first.quantity : null,
            variants,
          };
        },
      );
    }

    state = {
      type: "active",
      booking: {
        id: booking.id,
        token,
        status: booking.status,
        handle: booking.customer_handle ?? "",
        email: booking.customer_email ?? "",
        placement: fd?.placement ?? "",
        size: fd?.size ?? "",
        description: fd?.description ?? "",
        referenceLink: fd?.reference_link ?? null,
        preferredDate: booking.preferred_date ?? "",
        artistName:
          (profile as { display_name: string } | null)?.display_name ??
          "the artist",
        bookingModeLabel: bookingModeLabel(bookingMode),
        canEdit: support.editable,
        editDisabledReason: support.editable ? null : support.reason,
        depositAmount: booking.deposit_amount
          ? Number(booking.deposit_amount)
          : null,
        depositDueAt: booking.deposit_due_at ?? null,
        depositNote: booking.deposit_note ?? null,
        depositClientSecret: booking.deposit_client_secret ?? null,
        stripePublishableKey:
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
        addonProducts,
      },
    };
  }

  if (state.type === "active") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-10 block text-center text-xl font-semibold tracking-tight text-foreground"
          >
            inklee
          </Link>
          <CustomerPortal booking={state.booking} />
        </div>
      </div>
    );
  }

  const messages: Record<
    Exclude<PageState["type"], "active">,
    { headline: string; body: string }
  > = {
    expired: {
      headline: "Link expired",
      body: "This link was valid for 30 days. Contact the artist directly if you need to make changes.",
    },
    used: {
      headline: "Link already used",
      body: "This link was a one-time edit link. Check your email for a new link that was sent after your last edit.",
    },
    cancelled: {
      headline: "Request cancelled",
      body: "This booking request has been cancelled.",
    },
    "not-found": {
      headline: "Link not found",
      body: "This link doesn't match any booking request. It may be invalid or mistyped.",
    },
  };

  const { headline, body } = messages[state.type];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <Link
          href="/"
          className="mb-8 block text-xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>
        <h1 className="text-lg font-semibold text-foreground">{headline}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
