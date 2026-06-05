/**
 * Human-readable labels for booking and waitlist statuses.
 *
 * Replaces raw `status.replace("_", " ")` leaks (e.g. "deposit_pending" surfaced
 * verbatim in empty-state copy) with tattoo-native wording. Internal DB values
 * are unchanged.
 */
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
