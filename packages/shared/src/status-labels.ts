/**
 * Human-readable labels for booking and waitlist statuses.
 *
 * Replaces raw `status.replace("_", " ")` leaks (e.g. "deposit_pending" surfaced
 * verbatim in empty-state copy) with tattoo-native wording. Internal DB values
 * are unchanged.
 */
/** Slot statuses (slots.status enum, minus the never-written "cancelled").
 *  "locked" means a client holds it mid-checkout or a paid deposit approved
 *  the booking without flipping the slot — taken either way. Shared so the
 *  web slot list and the mobile slots screen label them identically. */
export function slotStatusLabel(status: string): string {
  switch (status) {
    case "open":
      return "Open";
    case "locked":
      return "On hold";
    case "booked":
      return "Booked";
    default:
      return status;
  }
}

export function humanStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Accepted";
    case "rejected":
      return "Passed";
    case "deposit_pending":
      return "Awaiting deposit";
    case "cancelled":
      return "Cancelled";
    case "waiting":
      return "Waiting";
    case "contacted":
      return "Contacted";
    case "converted":
      return "Converted";
    case "dismissed":
      return "Dismissed";
    default:
      return status;
  }
}
