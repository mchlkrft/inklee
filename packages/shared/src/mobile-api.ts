// Response shapes for the GET /api/mobile/* read endpoints — the single source
// of truth shared by the server route handlers (apps/web) and the screens that
// consume them (apps/mobile). Each route builds its JSON as a typed const of the
// matching type here, and each screen types its fetch with the same type, so the
// two sides cannot drift. These describe ONLY the `data` payload — the route
// helpers wrap it in the `{ data }` / `{ error }` envelope.

/** GET /api/mobile/me — the signed-in artist's identity + plan/entitlement state. */
export type MobileMe = {
  userId: string;
  slug: string | null;
  displayName: string | null;
  timezone: string;
  onboardingCompleted: boolean;
  plan: string;
  canCollectDeposits: boolean;
};

/** GET /api/mobile/settings/profile — the editable profile fields. */
export type MobileProfile = {
  slug: string | null;
  displayName: string | null;
  bio: string | null;
  timezone: string | null;
  location: string | null;
  logoUrl: string | null;
  instagramHandle: string | null;
};

/** GET /api/mobile/settings/payouts — the artist's stored Stripe Connect payout status. */
export type MobilePayouts = {
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  country: string | null;
};

/** One booking row in the Home aggregate (pending / upcoming). */
export type MobileHomeBooking = {
  id: string;
  client: string;
  placement: string | null;
  preferredDate: string | null;
  createdAt: string | null;
};

/** GET /api/mobile/home — the "what needs action right now" Home-tab aggregate. */
export type MobileHome = {
  displayName: string | null;
  slug: string | null;
  booksOpen: boolean;
  onboardingCompleted: boolean;
  pendingCount: number;
  pending: MobileHomeBooking[];
  upcoming: MobileHomeBooking[];
  waitlistCount: number;
};

/** One row in the booking inbox (GET /api/mobile/bookings list). */
export type MobileBookingListItem = {
  id: string;
  status: string;
  client: string;
  placement: string | null;
  size: string | null;
  preferredDate: string | null;
  createdAt: string;
  depositAmount: number | null;
  depositCurrency: string;
  depositPaid: boolean;
};

/** GET /api/mobile/bookings?status=&cursor=&limit= — keyset-paginated inbox page. */
export type MobileBookingsPage = {
  items: MobileBookingListItem[];
  nextCursor: string | null;
};

// The deposit block on a booking detail. `hasCardIntent` is true when this is a
// live in-app card PaymentIntent (vs a manual deposit paid to the artist
// directly); `refunded` is true once a refund has been issued (derived
// server-side from the audit log).
export type MobileBookingDeposit = {
  amount: number;
  currency: string;
  dueAt: string | null;
  note: string | null;
  paid: boolean;
  hasCardIntent: boolean;
  refunded: boolean;
};

/** GET /api/mobile/bookings/:id — full request detail (the core screen). */
export type MobileBookingDetail = {
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
  deposit: MobileBookingDeposit | null;
};

/** One confirmed appointment (approved, dated booking) from GET /api/mobile/calendar. */
export type MobileCalendarAppointment = {
  id: string;
  client: string;
  placement: string | null;
  date: string;
};

/** GET /api/mobile/calendar?from=&to= — confirmed appointments in the range. */
export type MobileCalendarResponse = {
  items: MobileCalendarAppointment[];
};

/** One row in GET /api/mobile/clients — a client aggregated over booking_requests. */
export type MobileClientListItem = {
  email: string;
  handle: string;
  bookingCount: number;
  lastBookingAt: string;
  latestStatus: string;
};

/** One booking in a client's history (GET /api/mobile/clients/:email). */
export type MobileClientHistoryItem = {
  id: string;
  status: string;
  placement: string | null;
  size: string | null;
  preferredDate: string | null;
  createdAt: string;
  depositAmount: number | null;
};

/** GET /api/mobile/clients/:email — one client's booking history + notes. */
export type MobileClientDetail = {
  email: string;
  client: string;
  notes: string | null;
  bookingCount: number;
  history: MobileClientHistoryItem[];
};
