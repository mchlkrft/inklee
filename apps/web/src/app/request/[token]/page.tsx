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
import { getAddonProducts } from "@/lib/addon-products";
import { isGoodsCommerceEnabled } from "@/lib/features";
import { parseDepositPolicy } from "@/lib/deposit-policy";
import { fetchSellerData, sellerDataComplete } from "@/lib/server/seller-data";
import { SUPPORT_INBOX_EMAIL } from "@/lib/server/support";
import type { CompleteSellerData } from "@inklee/shared/consumer-disclosures";

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
      deposit_amount, deposit_currency, deposit_due_at, deposit_note,
      deposit_client_secret, deposit_policy,
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

    // Pre-checkout goods rendering. The portal shows the INTERSECTION of:
    //   (a) booking_interests rows the artist confirmed `available` for
    //       THIS booking, and
    //   (b) the artist's current strict checkout-addon catalogue
    //       (is_checkout_addon=true + production money gate).
    // Prices, variant names, and stock come from the current catalogue, not
    // the interest snapshots — snapshots are for the artist's "what they
    // marked" view, but the checkout total has to use authoritative prices,
    // and stock has to reflect what's actually still on hand. Quantity is
    // capped at min(catalogue stock, artist-confirmed interest qty) so the
    // stepper can't exceed either constraint.
    //
    // A non-addon product (interest signal only) appears in (a) but NOT in
    // (b), so it stays a signal only — no payable row.
    // RS-3: the pre-checkout add-on intersection is part of the parked goods
    // flow. Skip it entirely when commerce is off — the portal renders a
    // deposit-only payment (no goods rows ever surface).
    // GOODS-DISC-001: the C1.1 seller-data prerequisite, checked at the SAME
    // authority the standalone shop's own page uses (sellerDataComplete).
    // Only fetched when goods could possibly surface at all (same RS-3/status
    // gate as the add-on read below) — an approved booking or a parked-goods
    // deployment has no use for it. `addonGoodsSellerGate` is the
    // authoritative money-path re-check in prepareCheckoutAction; this is the
    // page-layer half of the same defense-in-depth pair (SHOP-VIS-001
    // posture) — an artist with incomplete seller data gets NO add-on rows at
    // all here, so there is nothing to disclose incompletely or to gate past.
    const goodsCouldApply =
      isGoodsCommerceEnabled() && booking.status === "deposit_pending";
    const seller = goodsCouldApply
      ? await fetchSellerData(booking.artist_id)
      : { tradingName: null, address: null, contact: null };
    const sellerComplete = goodsCouldApply && sellerDataComplete(seller);

    const addonProducts: AddonProductView[] = [];
    if (goodsCouldApply && sellerComplete) {
      const { data: rawInterests } = await serviceClient
        .from("booking_interests")
        .select("product_id, variant_id, quantity")
        .eq("booking_id", booking.id)
        .eq("status", "available")
        .order("created_at", { ascending: true });
      const confirmedQty = new Map<string, number>();
      const interestedProductIds = new Set<string>();
      for (const r of (rawInterests ?? []) as {
        product_id: string | null;
        variant_id: string | null;
        quantity: number;
      }[]) {
        if (!r.product_id) continue;
        const key = `${r.product_id}::${r.variant_id ?? ""}`;
        confirmedQty.set(key, Number(r.quantity));
        interestedProductIds.add(r.product_id);
      }
      if (interestedProductIds.size > 0) {
        const catalogue = await getAddonProducts(booking.artist_id);
        for (const p of catalogue) {
          if (!interestedProductIds.has(p.id)) continue;
          if (p.variants.length > 0) {
            const variantViews = p.variants
              .filter((v) => v.status === "active")
              .map((v) => {
                const cap = confirmedQty.get(`${p.id}::${v.id}`);
                if (cap === undefined) return null;
                const onHand = v.stock !== null ? v.stock : cap;
                return {
                  id: v.id,
                  name: v.name,
                  price: v.priceOverride ?? p.price,
                  stock: Math.max(0, Math.min(cap, onHand)),
                };
              })
              .filter((v): v is NonNullable<typeof v> => v !== null);
            if (variantViews.length === 0) continue;
            addonProducts.push({
              id: p.id,
              title: p.title,
              imageUrl: p.imageUrl,
              price: p.price,
              stock: null,
              customMade: p.customMade === true,
              variants: variantViews,
            });
          } else {
            const cap = confirmedQty.get(`${p.id}::`);
            if (cap === undefined) continue;
            const onHand = p.quantity !== null ? p.quantity : cap;
            addonProducts.push({
              id: p.id,
              title: p.title,
              imageUrl: p.imageUrl,
              price: p.price,
              stock: Math.max(0, Math.min(cap, onHand)),
              customMade: p.customMade === true,
              variants: [],
            });
          }
        }
      }
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
        depositCurrency: booking.deposit_currency ?? "eur",
        depositDueAt: booking.deposit_due_at ?? null,
        depositNote: booking.deposit_note ?? null,
        depositClientSecret: booking.deposit_client_secret ?? null,
        stripePublishableKey:
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
        // Q9: the deposit policy FROZEN onto this booking at request time (not
        // the artist's current policy). Drives the pre-payment disclosure.
        depositPolicy: booking.deposit_policy
          ? parseDepositPolicy(booking.deposit_policy)
          : null,
        addonProducts,
        // GOODS-DISC-001: null (never rendered as a disclosure) unless the
        // seller data is actually complete — mirroring `addonProducts` being
        // empty in the same case, so the two can never disagree.
        seller: sellerComplete ? (seller as CompleteSellerData) : null,
        supportEmail: SUPPORT_INBOX_EMAIL,
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
