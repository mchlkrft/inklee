import { apiPost } from "./api";

// Shape of GET /api/mobile/bookings/:id (see the route handler). The detail
// screen and BookingActions read from this.
export type BookingDeposit = {
  amount: number;
  currency: string;
  dueAt: string | null;
  note: string | null;
  paid: boolean;
  // True when this deposit is a live in-app card PaymentIntent (vs a manual
  // deposit paid to the artist directly). Gates the refund button and the
  // "waiting for card payment" vs "mark received" UI.
  hasCardIntent: boolean;
  // True once a refund has been issued (derived server-side from the audit
  // log). Hides the refund button and corrects the cancel copy.
  refunded: boolean;
};

export type BookingDetail = {
  id: string;
  status: string;
  client: string;
  handle: string | null;
  email: string | null;
  placement: string | null;
  size: string | null;
  sizeRaw: string | null;
  description: string | null;
  referenceLink: string | null;
  referenceImagePaths: string[];
  preferredDate: string | null;
  createdAt: string;
  deposit: BookingDeposit | null;
};

// A paid, not-yet-refunded in-app card deposit — the only kind that can be
// refunded in-app, and the thing that makes an artist-cancel auto-refund the
// client. Mirrors the web `hasPaidInAppDeposit && !depositRefunded` gating in
// requests/[id]/page.tsx.
export function canRefundDeposit(d: BookingDetail): boolean {
  return (
    !!d.deposit &&
    d.deposit.paid &&
    d.deposit.hasCardIntent &&
    !d.deposit.refunded
  );
}

// Mutations resolve to { ok: true } on success; apiPost throws ApiError on the
// server's { error } envelope (state-machine guard, ownership, validation).
export function approveBooking(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/approve`);
}
export function rejectBooking(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/reject`);
}
export function cancelBooking(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/cancel`);
}
export function requestDeposit(
  id: string,
  amount: number,
  dueAt: string,
  note: string | null,
) {
  return apiPost<{ ok: true }>(`/bookings/${id}/deposit`, {
    amount,
    dueAt,
    note,
  });
}
export function markDepositReceived(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/deposit-received`);
}
export function refundDeposit(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/deposit-refund`);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  eur: "€",
  usd: "$",
  gbp: "£",
  chf: "CHF ",
  sek: "kr ",
  nok: "kr ",
  dkk: "kr ",
  pln: "zł ",
  czk: "Kč ",
  cad: "$",
  aud: "$",
};

/** Compact money formatting for deposit amounts (RN-safe, no Intl dependency). */
export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toLowerCase()];
  const value = amount.toFixed(2);
  return symbol ? `${symbol}${value}` : `${currency.toUpperCase()} ${value}`;
}
