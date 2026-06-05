export type BookingStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "deposit_pending"
  | "cancelled";

// Valid status transitions — any transition not listed here is rejected
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["approved", "rejected", "deposit_pending", "cancelled"],
  deposit_pending: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
  rejected: [],
  cancelled: [],
};

export function canTransition(
  from: string,
  to: BookingStatus,
): { ok: true } | { ok: false; reason: string } {
  const allowed = TRANSITIONS[from as BookingStatus];
  if (!allowed) {
    return { ok: false, reason: `unknown status: ${from}` };
  }
  if (!allowed.includes(to)) {
    if (allowed.length === 0) {
      return {
        ok: false,
        reason: `booking is already ${from} — no further changes allowed`,
      };
    }
    return {
      ok: false,
      reason: `cannot move from ${from} to ${to}`,
    };
  }
  return { ok: true };
}

export function isTerminal(status: string): boolean {
  const allowed = TRANSITIONS[status as BookingStatus];
  return allowed !== undefined && allowed.length === 0;
}
