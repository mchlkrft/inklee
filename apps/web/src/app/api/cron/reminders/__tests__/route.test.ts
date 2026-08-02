import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEPOSIT_OVERDUE_MAX_SENDS,
  DEPOSIT_OVERDUE_STALENESS_FLOOR_DAYS,
} from "../constants";
import { addDaysToDateKey, localDateKey } from "@/lib/date-utils";

// CRON-RMD-001: the deposit_overdue branch had no upper bound on sends and no
// staleness floor. `alreadySentToday` only suppressed a SECOND send on the
// SAME day, so a stuck booking got a fresh email every day forever —
// production sent one address 46 reminders over 50 days. This suite pins the
// two backstops added to close that: a per-booking, all-time send count cap
// (`DEPOSIT_OVERDUE_MAX_SENDS`) and an age floor
// (`DEPOSIT_OVERDUE_STALENESS_FLOOR_DAYS`) that stops nagging about a deposit
// old enough to be treated as abandoned everywhere else in the system.
//
// date-utils, timezone and reminder-settings are left REAL (pure functions,
// no I/O) — only serviceClient, the email senders and resolveStudioForBooking
// are mocked. The appointment_reminder and reconfirmation branches are
// starved with an empty booking list in every test here: they are already
// naturally single-shot (production confirms max 1 send/booking for both)
// and are not part of this defect.

const {
  mockSendDepositOverdueCustomer,
  mockSendDepositOverdueArtist,
  mockSendAppointmentReminder,
  mockSendReconfirmationRequest,
  mockCaptureException,
  mockResolveStudioForBooking,
} = vi.hoisted(() => ({
  mockSendDepositOverdueCustomer: vi.fn().mockResolvedValue(undefined),
  mockSendDepositOverdueArtist: vi.fn().mockResolvedValue(undefined),
  mockSendAppointmentReminder: vi.fn().mockResolvedValue(undefined),
  mockSendReconfirmationRequest: vi.fn().mockResolvedValue(undefined),
  mockCaptureException: vi.fn(),
  mockResolveStudioForBooking: vi.fn().mockResolvedValue(null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}));
vi.mock("@/lib/email/reminder-emails", () => ({
  sendDepositOverdueCustomer: (...a: unknown[]) =>
    mockSendDepositOverdueCustomer(...a),
  sendDepositOverdueArtist: (...a: unknown[]) =>
    mockSendDepositOverdueArtist(...a),
  sendAppointmentReminder: (...a: unknown[]) =>
    mockSendAppointmentReminder(...a),
  sendReconfirmationRequest: (...a: unknown[]) =>
    mockSendReconfirmationRequest(...a),
}));
vi.mock("@/lib/booking-studio", () => ({
  resolveStudioForBooking: (...a: unknown[]) =>
    mockResolveStudioForBooking(...a),
}));

type OverdueBooking = {
  id: string;
  customer_email: string;
  customer_handle: string | null;
  deposit_amount: number | null;
  deposit_currency: string | null;
  deposit_due_at: string;
  deposit_note: string | null;
  artist_id: string;
};

type ArtistProfile = {
  display_name: string;
  timezone: string;
  settings: Record<string, unknown>;
};

let overdueBookings: OverdueBooking[] = [];
const profilesById = new Map<string, ArtistProfile>();
/** booking_id -> total all-time reminder_sent rows for deposit_overdue */
const sendCountByBooking = new Map<string, number>();
/** booking_id -> already sent today (deposit_overdue) */
const sentTodayByBooking = new Map<string, boolean>();
const auditInserts: Array<Record<string, unknown>> = [];
const emailsByArtist = new Map<string, string>();

type Reply = { data?: unknown; error?: unknown; count?: unknown };

function chain(resolve: () => Reply) {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    not: () => self,
    gte: () => self,
    lte: () => self,
    filter: () => self,
    then: (onFulfilled: (v: Reply) => unknown, onRejected?: unknown) =>
      Promise.resolve(resolve()).then(
        onFulfilled,
        onRejected as (r: unknown) => unknown,
      ),
  };
  return self;
}

// Persists ACROSS the three separate `.from("booking_requests")` calls the
// route makes per GET (one per reminder block), not just within one of them.
let bookingRequestsSelectCallIndex = 0;

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => {
      if (table === "booking_requests") {
        return {
          select: () => {
            bookingRequestsSelectCallIndex++;
            // 1st select() on booking_requests = deposit_overdue fetch.
            // 2nd/3rd = appointment_reminder / reconfirmation fetches,
            // deliberately starved with an empty list — this suite is
            // scoped to the deposit_overdue branch only.
            return chain(() => ({
              data: bookingRequestsSelectCallIndex === 1 ? overdueBookings : [],
              error: null,
            }));
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_col: string, artistId: string) => ({
              single: () =>
                Promise.resolve({
                  data: profilesById.get(artistId) ?? null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "audit_log") {
        return {
          select: () => {
            const op: { bookingId?: string; hasGte: boolean } = {
              hasGte: false,
            };
            const self: Record<string, unknown> = {
              eq: (col: string, val: string) => {
                if (col === "booking_id") op.bookingId = val;
                return self;
              },
              filter: () => self,
              gte: () => {
                op.hasGte = true;
                return self;
              },
              then: (onFulfilled: (v: Reply) => unknown) => {
                const count = op.hasGte
                  ? sentTodayByBooking.get(op.bookingId ?? "")
                    ? 1
                    : 0
                  : (sendCountByBooking.get(op.bookingId ?? "") ?? 0);
                return Promise.resolve({ count, error: null }).then(
                  onFulfilled,
                );
              },
            };
            return self;
          },
          insert: (payload: Record<string, unknown>) => {
            auditInserts.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    auth: {
      admin: {
        getUserById: (artistId: string) =>
          Promise.resolve({
            data: { user: { email: emailsByArtist.get(artistId) ?? null } },
          }),
      },
    },
  },
}));

import { GET } from "../route";

function req() {
  return new Request("https://inkl.ee/api/cron/reminders", {
    headers: { authorization: "Bearer test-secret" },
  });
}

function overdueBooking(overrides: Partial<OverdueBooking>): OverdueBooking {
  return {
    id: "b1",
    customer_email: "customer@example.com",
    customer_handle: "customer",
    deposit_amount: 5000,
    deposit_currency: "eur",
    deposit_due_at: addDaysToDateKey(localDateKey(), -2),
    deposit_note: null,
    artist_id: "artist-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  bookingRequestsSelectCallIndex = 0;
  overdueBookings = [];
  profilesById.clear();
  sendCountByBooking.clear();
  sentTodayByBooking.clear();
  auditInserts.length = 0;
  emailsByArtist.clear();

  profilesById.set("artist-1", {
    display_name: "Test Artist",
    timezone: "UTC",
    settings: { deposit_overdue_enabled: true },
  });
  emailsByArtist.set("artist-1", "artist@example.com");
});

describe("reminders deposit_overdue send limits (CRON-RMD-001)", () => {
  it("sends a fresh, moderately overdue booking with no prior sends (control)", async () => {
    overdueBookings = [overdueBooking({})];
    sendCountByBooking.set("b1", 0);

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(mockSendDepositOverdueCustomer).toHaveBeenCalledTimes(1);
    expect(mockSendDepositOverdueArtist).toHaveBeenCalledTimes(1);
    expect(auditInserts).toHaveLength(1);
    expect(body.deposit_overdue).toBe(1);
    expect(body.deposit_overdue_limit_reached).toBe(0);
  });

  it(`stops sending once a booking has reached ${DEPOSIT_OVERDUE_MAX_SENDS} all-time sends, even though it was never sent TODAY`, async () => {
    overdueBookings = [overdueBooking({ id: "b-at-cap" })];
    // Already sent DEPOSIT_OVERDUE_MAX_SENDS times on past days, but NOT
    // today — `alreadySentToday` alone would let this one through, which is
    // exactly the production failure mode (same-day suppression only).
    sendCountByBooking.set("b-at-cap", DEPOSIT_OVERDUE_MAX_SENDS);
    sentTodayByBooking.set("b-at-cap", false);

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    // Fails if the send-count cap is removed: a booking that already hit the
    // limit would be emailed again on every subsequent run forever, which is
    // the exact shape of the production incident (46 sends to one address).
    expect(mockSendDepositOverdueCustomer).not.toHaveBeenCalled();
    expect(mockSendDepositOverdueArtist).not.toHaveBeenCalled();
    expect(auditInserts).toHaveLength(0);
    expect(body.deposit_overdue).toBe(0);
    expect(body.deposit_overdue_limit_reached).toBe(1);
  });

  it("still sends a booking one send short of the cap (boundary control)", async () => {
    overdueBookings = [overdueBooking({ id: "b-below-cap" })];
    sendCountByBooking.set("b-below-cap", DEPOSIT_OVERDUE_MAX_SENDS - 1);
    sentTodayByBooking.set("b-below-cap", false);

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(mockSendDepositOverdueCustomer).toHaveBeenCalledTimes(1);
    expect(body.deposit_overdue).toBe(1);
    expect(body.deposit_overdue_limit_reached).toBe(0);
  });

  it(`stops sending once the deposit is more than ${DEPOSIT_OVERDUE_STALENESS_FLOOR_DAYS} days overdue, regardless of send count`, async () => {
    overdueBookings = [
      overdueBooking({
        id: "b-ancient",
        deposit_due_at: addDaysToDateKey(
          localDateKey(),
          -(DEPOSIT_OVERDUE_STALENESS_FLOOR_DAYS + 1),
        ),
      }),
    ];
    // Zero prior sends — only the staleness floor can be stopping this one.
    sendCountByBooking.set("b-ancient", 0);
    sentTodayByBooking.set("b-ancient", false);

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    // Fails if the staleness floor is removed: a booking whose deposit was
    // due, say, a year ago would still be nagged daily forever as long as it
    // stayed under the send-count cap (which resets meaning only within the
    // cap — a booking abandoned long enough eventually needs an age check
    // independent of how many times it was already emailed).
    expect(mockSendDepositOverdueCustomer).not.toHaveBeenCalled();
    expect(auditInserts).toHaveLength(0);
    expect(body.deposit_overdue).toBe(0);
  });

  it("still sends a booking one day inside the staleness floor (boundary control)", async () => {
    overdueBookings = [
      overdueBooking({
        id: "b-just-inside",
        deposit_due_at: addDaysToDateKey(
          localDateKey(),
          -(DEPOSIT_OVERDUE_STALENESS_FLOOR_DAYS - 1),
        ),
      }),
    ];
    sendCountByBooking.set("b-just-inside", 0);
    sentTodayByBooking.set("b-just-inside", false);

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(mockSendDepositOverdueCustomer).toHaveBeenCalledTimes(1);
    expect(body.deposit_overdue).toBe(1);
  });

  it("still suppresses a same-day repeat via alreadySentToday, independent of the new cap", async () => {
    overdueBookings = [overdueBooking({ id: "b-sent-today" })];
    sendCountByBooking.set("b-sent-today", 1);
    sentTodayByBooking.set("b-sent-today", true);

    const res = await GET(req());

    expect(mockSendDepositOverdueCustomer).not.toHaveBeenCalled();
    expect(
      ((await res.json()) as Record<string, unknown>).deposit_overdue,
    ).toBe(0);
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(new Request("https://inkl.ee/api/cron/reminders"));
    expect(res.status).toBe(401);
  });
});
