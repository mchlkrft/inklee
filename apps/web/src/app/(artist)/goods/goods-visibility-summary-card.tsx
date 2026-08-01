import Link from "next/link";
import type { GoodsVisibilitySummary } from "@/lib/goods-visibility-summary";

// FD7 (founder ruling, 2026-08-01, CONFIRMS S2): a clear, one-place summary
// of where the artist's goods are currently public, so a non-cascading model
// (each surface toggled independently) still reads as one coherent picture
// rather than three unrelated switches. Pure presentation — every state is
// pre-derived by deriveGoodsVisibilitySummary (goods-visibility-summary.ts).

function standaloneShopLine(
  s: GoodsVisibilitySummary["standaloneShop"],
): string {
  if (!s.commerceLive) {
    return "Not live yet. Inklee hasn't turned on card orders for standalone shops yet, so this isn't something you need to fix.";
  }
  if (!s.toggleOn) {
    return "Off. Turn it on below to let clients buy your products without booking an appointment.";
  }
  if (!s.connectReady) {
    return "On, but it can't take orders yet. Connect your Stripe account to accept payments.";
  }
  return "Live. Clients can buy directly from you without booking an appointment.";
}

function hubBlockLine(h: GoodsVisibilitySummary["hubBlock"]): string {
  if (!h.present) {
    return "Not added. Add a shop block from your Link Hub to feature your products there too.";
  }
  const destinationLabel =
    h.destination === "standalone_shop"
      ? "your standalone shop"
      : "your booking page's shop section";
  if (h.available) {
    return `Added, pointing at ${destinationLabel}.`;
  }
  return `Added, but hidden right now: it points at ${destinationLabel}, which isn't currently public. Turn that on, or change the block's destination in your Link Hub.`;
}

export default function GoodsVisibilitySummaryCard({
  summary,
}: {
  summary: GoodsVisibilitySummary;
}) {
  return (
    <div className="space-y-3 rounded-[20px] border border-border px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Where your goods are public
        </h2>
        {summary.publishedNowhere && (
          <p className="mt-1 text-sm text-muted-foreground">
            Your goods aren&apos;t published anywhere right now. Turn on a
            surface below to start showing them.
          </p>
        )}
      </div>

      <ul className="space-y-3 text-sm">
        <li className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">Booking page</p>
            <p className="text-muted-foreground">
              {summary.bookingPage.visible
                ? "Visible in your booking page's shop section."
                : "Hidden. Clients don't see your products on your booking page."}
            </p>
          </div>
          <Link
            href="/bookings/settings"
            className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Manage
          </Link>
        </li>

        <li>
          <p className="font-medium text-foreground">Standalone shop</p>
          <p className="text-muted-foreground">
            {standaloneShopLine(summary.standaloneShop)}
          </p>
          {summary.standaloneShop.commerceLive &&
            summary.standaloneShop.toggleOn &&
            !summary.standaloneShop.connectReady && (
              <Link
                href="/settings/payouts"
                className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
              >
                Connect Stripe
              </Link>
            )}
        </li>

        <li className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">Link Hub block</p>
            <p className="text-muted-foreground">
              {hubBlockLine(summary.hubBlock)}
            </p>
          </div>
          <Link
            href="/link-hub"
            className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Manage
          </Link>
        </li>
      </ul>
    </div>
  );
}
