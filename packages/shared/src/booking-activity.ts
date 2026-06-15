// Artist-facing labels for the booking activity timeline, shared by the web
// CommunicationSidebar and the mobile booking-detail route so the two surfaces
// can't drift. Icons and colors stay platform-local, keyed off `kind`.
//
// Returns null for internal plumbing the artist shouldn't see (magic-link
// token rotation, refund bookkeeping, unknown actions).

export type BookingActivityKind =
  | "submitted"
  | "client_edited"
  | "client_cancelled"
  | "deposit_paid"
  | "reminder"
  | "accepted"
  | "passed"
  | "deposit_requested"
  | "cancelled"
  | "status_other";

export type BookingActivityDescription = {
  kind: BookingActivityKind;
  label: string;
};

export function describeBookingActivity(
  action: string,
  details: Record<string, unknown>,
): BookingActivityDescription | null {
  switch (action) {
    case "token_rotated":
      return null; // internal magic-link housekeeping — not communication
    case "booking_created":
      return { kind: "submitted", label: "Booking submitted" };
    case "customer_edited":
      return { kind: "client_edited", label: "Client updated their request" };
    case "customer_cancelled":
      return { kind: "client_cancelled", label: "Cancelled by client" };
    case "deposit_paid":
      return { kind: "deposit_paid", label: "Deposit paid" };
    case "reminder_sent": {
      const manual = details?.manual === true;
      return {
        kind: "reminder",
        label: manual ? "Reminder sent (manual)" : "Reminder sent",
      };
    }
    case "status_changed": {
      const to = String(details?.to ?? "");
      if (to === "approved") return { kind: "accepted", label: "Accepted" };
      if (to === "rejected") return { kind: "passed", label: "Passed" };
      if (to === "deposit_pending")
        // The deposit request triggers the customer email, so this row's date
        // is the deposit-request mail date.
        return { kind: "deposit_requested", label: "Deposit requested" };
      if (to === "cancelled") return { kind: "cancelled", label: "Cancelled" };
      return { kind: "status_other", label: "Status updated" };
    }
    default:
      return null; // unknown internal actions stay hidden
  }
}
