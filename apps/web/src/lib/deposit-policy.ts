// Deposit policy (Q9). A STRUCTURED chooser, never free text — the platform
// enforces the shape so artists can't write an unenforceable "non-refundable in
// all cases" clause (legal package draft §9 §§12-14). The artist sets:
//   • refund window  — full client refund if they cancel within it
//   • late-cancel forfeit % — from a constrained list, applied after the window
//   • optional last-minute window — a tight window where 100% is forfeited
// Reciprocity (artist cancels => full client refund) is hard-coded in app logic,
// not stored here, and not artist-overridable.
//
// Stored in profiles.settings.deposit_policy (JSONB, no migration — same pattern
// as deposit_defaults). Frozen onto the booking at payment time (migration 0043:
// booking_requests.deposit_policy + deposit_policy_snapshot).

export const FORFEIT_PCT_OPTIONS = [25, 50, 100] as const;
export type ForfeitPct = (typeof FORFEIT_PCT_OPTIONS)[number];

export type TimeUnit = "days" | "hours";
export type PolicyWindow = { value: number; unit: TimeUnit };

export type DepositPolicy = {
  /** Full client refund if the client cancels within this window before the appointment. */
  refundWindow: PolicyWindow;
  /** % of the deposit kept when the client cancels AFTER the refund window. */
  lateCancelForfeitPct: ForfeitPct;
  /** Optional tight window before the appointment where 100% is forfeited. */
  lastMinute: PolicyWindow | null;
};

// Conservative DRAFT default, pending counsel review of the safe-harbour values
// (draft §9 §14): refundable until 7 days before the appointment, 50% forfeit
// thereafter, full refund if the artist cancels. The settings UI labels this
// "draft default — pending counsel review" until counsel confirms.
export const DEPOSIT_POLICY_DEFAULT: DepositPolicy = {
  refundWindow: { value: 7, unit: "days" },
  lateCancelForfeitPct: 50,
  lastMinute: null,
};

const MAX_DAYS = 365;
const MAX_HOURS = 720;

function clampWindow(w: PolicyWindow): PolicyWindow {
  const max = w.unit === "hours" ? MAX_HOURS : MAX_DAYS;
  const value = Math.max(0, Math.min(max, Math.round(w.value)));
  return { value, unit: w.unit };
}

function parseWindow(raw: unknown): PolicyWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const unit: TimeUnit = o.unit === "hours" ? "hours" : "days";
  if (typeof o.value !== "number" || !Number.isFinite(o.value)) return null;
  return clampWindow({ value: o.value, unit });
}

function parseForfeit(raw: unknown): ForfeitPct {
  return (FORFEIT_PCT_OPTIONS as readonly number[]).includes(raw as number)
    ? (raw as ForfeitPct)
    : DEPOSIT_POLICY_DEFAULT.lateCancelForfeitPct;
}

export function parseDepositPolicy(raw: unknown): DepositPolicy {
  if (!raw || typeof raw !== "object") return DEPOSIT_POLICY_DEFAULT;
  const o = raw as Record<string, unknown>;
  return {
    refundWindow:
      parseWindow(o.refundWindow) ?? DEPOSIT_POLICY_DEFAULT.refundWindow,
    lateCancelForfeitPct: parseForfeit(o.lateCancelForfeitPct),
    lastMinute: parseWindow(o.lastMinute),
  };
}

/** True when the policy is still the untouched conservative draft default. */
export function isDraftDefaultPolicy(policy: DepositPolicy): boolean {
  return (
    policy.refundWindow.value === DEPOSIT_POLICY_DEFAULT.refundWindow.value &&
    policy.refundWindow.unit === DEPOSIT_POLICY_DEFAULT.refundWindow.unit &&
    policy.lateCancelForfeitPct ===
      DEPOSIT_POLICY_DEFAULT.lateCancelForfeitPct &&
    policy.lastMinute === null
  );
}

export function formatPolicyWindow(w: PolicyWindow): string {
  const unit =
    w.unit === "days"
      ? w.value === 1
        ? "day"
        : "days"
      : w.value === 1
        ? "hour"
        : "hours";
  return `${w.value} ${unit}`;
}

// Client-facing policy rules (no booking amount), in the order required by the
// pre-payment disclosure (draft §9 §12). Used for the disclosure block, the
// frozen snapshot, and the confirmation email. Sentence case for readability;
// no em-dashes per the repo copy rules.
export function depositPolicyLines(policy: DepositPolicy): string[] {
  const lines: string[] = [];
  lines.push(
    `Refundable until ${formatPolicyWindow(policy.refundWindow)} before your appointment.`,
  );
  lines.push(
    policy.lateCancelForfeitPct >= 100
      ? "If you cancel after that, the full deposit is kept."
      : `If you cancel after that, ${policy.lateCancelForfeitPct}% of the deposit is kept.`,
  );
  if (policy.lastMinute) {
    lines.push(
      `If you cancel within ${formatPolicyWindow(policy.lastMinute)} of your appointment, the full deposit is kept.`,
    );
  }
  lines.push("If the artist cancels, your full deposit is returned.");
  lines.push("You pay exactly the deposit amount. Inklee adds no fee for you.");
  lines.push(
    "Tattoo appointments booked for a specific date are exempt from the EU 14-day right of withdrawal.",
  );
  return lines;
}

/** Single-paragraph render of the policy, used for the snapshot + email body. */
export function renderDepositPolicyText(policy: DepositPolicy): string {
  return depositPolicyLines(policy).join(" ");
}
