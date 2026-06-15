export type BookingFunnelRow = {
  status: string;
  deposit_amount: string | number | null;
  deposit_paid_at: string | null;
  decided_at: string | null;
};

export function buildBookingFunnel(rows: BookingFunnelRow[]) {
  const submitted = rows.length;
  const reviewed = rows.filter((row) => row.decided_at !== null).length;
  const approved = rows.filter((row) => row.status === "approved").length;
  const depositRequested = rows.filter(
    (row) => row.deposit_amount !== null,
  ).length;
  const depositPaid = rows.filter((row) => row.deposit_paid_at !== null).length;
  const rejected = rows.filter((row) => row.status === "rejected").length;
  const cancelled = rows.filter((row) => row.status === "cancelled").length;

  return [
    { label: "Submitted", count: submitted },
    { label: "Reviewed", count: reviewed },
    { label: "Approved", count: approved },
    { label: "Deposit requested", count: depositRequested },
    { label: "Deposit paid", count: depositPaid },
    { label: "Rejected", count: rejected },
    { label: "Cancelled", count: cancelled },
  ];
}

export type IntegrityRow = {
  status: string;
  decided_at: string | null;
  deposit_amount: string | number | null;
  deposit_due_at: string | null;
  deposit_paid_at: string | null;
};

export function buildIntegrityFlags(rows: IntegrityRow[], overdueDate: string) {
  return {
    approvedNoDecidedAt: rows.filter(
      (row) => row.status === "approved" && row.decided_at === null,
    ).length,
    depositPendingNoAmount: rows.filter(
      (row) => row.status === "deposit_pending" && row.deposit_amount === null,
    ).length,
    unreconciled: rows.filter(
      (row) =>
        row.status === "deposit_pending" &&
        row.deposit_due_at !== null &&
        row.deposit_due_at < overdueDate &&
        row.deposit_paid_at === null,
    ).length,
  };
}
