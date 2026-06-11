// Response shapes for the GET /api/mobile/* read endpoints — the single source
// of truth shared by the server route handlers (apps/web) and the screens that
// consume them (apps/mobile). Each route builds its JSON as a typed const of the
// matching type here, and each screen types its fetch with the same type, so the
// two sides cannot drift. These describe ONLY the `data` payload — the route
// helpers wrap it in the `{ data }` / `{ error }` envelope.

import type { DashboardWidgets } from "./dashboard-settings";

/** GET /api/mobile/me — the signed-in artist's identity + plan/entitlement state. */
export type MobileMe = {
  userId: string;
  slug: string | null;
  displayName: string | null;
  timezone: string;
  bookingMode: string;
  booksOpen: boolean;
  onboardingCompleted: boolean;
  plan: string;
  canCollectDeposits: boolean;
};

/** GET /api/mobile/onboarding/slug-check?slug= — live availability for the claim screen. */
export type MobileSlugCheck = {
  slug: string;
  available: boolean;
  owned: boolean;
  error: string | null;
};

/** POST /api/mobile/onboarding/profile — result of claiming the booking link. */
export type MobileOnboardingProfile = {
  slug: string;
  displayName: string;
};

/** POST /api/mobile/onboarding/booking — result of the booking-setup write. */
export type MobileOnboardingBooking = {
  bookingMode: string;
  booksOpen: boolean;
};

/** POST /api/mobile/onboarding/complete — onboarding marked done. */
export type MobileOnboardingComplete = {
  onboardingCompleted: true;
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
  /** Public-page cover (profiles.settings.cover_image_url / cover_color). */
  coverImageUrl: string | null;
  coverColor: string | null;
};

/** GET/POST /api/mobile/settings/payouts — the artist's stored Stripe Connect payout status. */
export type MobilePayouts = {
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  country: string | null;
};

/** POST /api/mobile/settings/connect-link — a one-time link that opens the web
 *  Connect KYC (or another artist settings page) authed in an in-app browser. */
export type MobileConnectLink = {
  url: string;
};

/** One booking row in the Home aggregate (pending / upcoming). */
export type MobileHomeBooking = {
  id: string;
  client: string;
  placement: string | null;
  preferredDate: string | null;
  createdAt: string | null;
};

/** One upcoming guest-spot trip leg in the Home aggregate. */
export type MobileGuestSpot = {
  id: string;
  tripId: string;
  tripTitle: string;
  studioName: string | null;
  startsOn: string;
  endsOn: string;
};

/** GET /api/mobile/home — the dashboard aggregate backing the Home widget grid. */
export type MobileHome = {
  displayName: string | null;
  slug: string | null;
  bio: string | null;
  booksOpen: boolean;
  onboardingCompleted: boolean;
  /** Per-widget visibility (mirrors the web dashboard widget toggles). */
  dashboardWidgets: DashboardWidgets;
  pendingCount: number;
  pending: MobileHomeBooking[];
  upcoming: MobileHomeBooking[];
  guestSpots: MobileGuestSpot[];
  waitlistCount: number;
  /** Total requests ever received — drives the zero-request "share your link"
   *  convenience (force-show the links widget for brand-new artists). */
  totalReceivedCount: number;
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
  /** When the refund was issued (from the audit log), for the "Refunded on" note. */
  refundedAt: string | null;
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

/** One waitlist entry (GET /api/mobile/waitlist). */
export type MobileWaitlistEntry = {
  id: string;
  customer_email: string;
  customer_handle: string;
  note: string | null;
  status: string; // waiting | contacted | converted | dismissed
  created_at: string;
};

/** GET /api/mobile/waitlist?status= — the artist's waitlist entries. */
export type MobileWaitlistResponse = {
  items: MobileWaitlistEntry[];
};

/** GET /api/mobile/analytics?range=30|90|all — headline booking metrics. */
export type MobileAnalytics = {
  range: string;
  total: number;
  approved: number;
  rejected: number;
  conversionRate: number;
  rejectionRate: number;
  uniqueClients: number;
  repeatClients: number;
  returnRate: number;
  depositRequested: number;
  depositPaid: number;
  depositRate: number | null;
  months: { month: string; count: number }[];
};

/** GET /api/mobile/notifications — the feed (newest first) + unread count. */
export type MobileNotificationsResponse = {
  items: import("./notification-types").Notification[];
  unread: number;
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

/** One flash item row in the artist's flash list (GET /api/mobile/flash/items). */
export type MobileFlashItem = {
  id: string;
  title: string;
  status: string; // draft | published | archived
  priceType: string; // fixed | from | request
  price: number | null;
  isBookable: boolean;
  previewImageUrl: string | null;
  bookingMode: string; // unique | limited | repeatable
  flashDayId: string | null;
  /** Server-computed availability (the web flash engine runs on the server so
   *  the engine is not re-ported into the RN bundle). `bookable` reflects the
   *  full engine result (status + window + capacity), not raw is_bookable.
   *  `availabilityLabel` is null on the default happy path (published, bookable,
   *  unlimited) to keep rows uncluttered, matching the web tile rule. */
  bookable: boolean;
  availabilityLabel: string | null;
  remaining: number | null;
};

export type MobileFlashItemsResponse = { items: MobileFlashItem[] };

/** One of the artist's flash days, as an option for the item's day picker. */
export type MobileFlashDayOption = {
  id: string;
  title: string;
  scheduledOn: string | null;
};

/** GET /api/mobile/flash/items/:id — full editable item + the artist's flash days. */
export type MobileFlashItemDetail = {
  id: string;
  title: string;
  slug: string;
  status: string;
  priceType: string;
  price: number | null;
  shortDescription: string | null;
  sizeInfo: string | null;
  placementNotes: string | null;
  bookingMode: string;
  maxBookings: number | null;
  isBookable: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  flashDayId: string | null;
  previewImageUrl: string | null;
  flashDays: MobileFlashDayOption[];
  /** Stats sidebar (mirrors the web detail page): approved = confirmed,
   *  pending = pending; availability is the server-computed engine result. */
  pendingCount: number;
  confirmedCount: number;
  bookable: boolean;
  availabilityLabel: string;
  remaining: number | null;
};

/** One flash day (GET /api/mobile/flash/days, GET /api/mobile/flash/days/:id). */
export type MobileFlashDay = {
  id: string;
  title: string;
  scheduledOn: string | null;
  location: string | null;
  description: string | null;
  status: string; // upcoming | active | past | cancelled
  isPublic: boolean;
  itemCount: number;
};

export type MobileFlashDaysResponse = { items: MobileFlashDay[] };

/** One studio (GET /api/mobile/travel/studios). */
export type MobileStudio = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  publicNote: string | null;
  visibilityMode: string;
  isPrimary: boolean;
};

export type MobileStudiosResponse = { items: MobileStudio[] };

/** A studio as a picker option on a trip leg. */
export type MobileStudioOption = {
  id: string;
  name: string;
  city: string | null;
};

/** One leg (date range + optional studio) of a trip. */
export type MobileTripLeg = {
  id: string;
  startsOn: string;
  endsOn: string;
  studioId: string | null;
  studioName: string | null;
  notes: string | null;
};

/** One trip row (GET /api/mobile/travel/trips). */
export type MobileTrip = {
  id: string;
  title: string;
  description: string | null;
  showOnBookingForm: boolean;
  legCount: number;
};

export type MobileTripsResponse = { items: MobileTrip[] };

/** POST /api/mobile/.../image — the public URL of a freshly uploaded image. */
export type MobileImageUpload = { url: string };

/** One product row in the goods showcase list (GET /api/mobile/goods). */
export type MobileProduct = {
  id: string;
  title: string;
  category: string;
  price: number;
  currency: string;
  status: string; // active | hidden | sold_out
  isPublicVisible: boolean;
  imageUrl: string | null;
  /** Total number of images on this product (length of image_urls, falling back
   *  to the single image_url). Drives the tile's "+N" gallery badge. */
  imageCount: number;
};

export type MobileProductsResponse = { items: MobileProduct[] };

/** GET /api/mobile/goods/:id — the full editable product (metadata only). */
export type MobileProductDetail = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  price: number;
  currency: string;
  status: string;
  pickupNote: string | null;
  quantity: number | null;
  isPublicVisible: boolean;
  imageUrl: string | null;
};

/** GET /api/mobile/travel/trips/:id — a trip with its legs + the artist's studios. */
export type MobileTripDetail = {
  id: string;
  title: string;
  description: string | null;
  showOnBookingForm: boolean;
  legs: MobileTripLeg[];
  studios: MobileStudioOption[];
};

/** One of the five per-status booking email templates
 *  (GET /api/mobile/settings/email-templates). */
export type MobileEmailTemplate = {
  type: import("./email-templates").EmailTemplateType;
  label: string;
  /** Fixed subject line (system default; not editable). */
  subject: string;
  /** Body shown in the editor — the artist's saved custom body, falling back
   *  to the system default when none is saved. */
  body: string;
  /** True when the body differs from the system default (the "Edited" chip). */
  edited: boolean;
  /** False when the type is in profiles.settings.disabled_emails (not sent). */
  enabled: boolean;
};

/** GET /api/mobile/settings/email-templates — the editable booking emails plus
 *  the merge variables a body may reference. */
export type MobileEmailTemplatesResponse = {
  items: MobileEmailTemplate[];
  allowedVars: string[];
};

/** POST /api/mobile/settings/email-templates/reset — the restored default body. */
export type MobileEmailTemplateReset = {
  body: string;
};

/** One row in the mobile booking-form summary: standard + custom fields
 *  interleaved in the artist's saved field order. */
export type MobileBookingFormField = {
  /** Standard-field id (e.g. "email") or the custom field's uuid. */
  id: string;
  kind: "standard" | "custom";
  label: string;
  /** Custom-field type badge (Text, Dropdown, …); null for standard fields. */
  typeLabel: string | null;
  /** False when a standard field is hidden or a custom field is inactive. */
  enabled: boolean;
  required: boolean;
  /** Email + preferred date can never be hidden on the public form. */
  alwaysOn: boolean;
};

/** GET /api/mobile/booking-form — read-only aggregate for the booking-form
 *  summary screen (share link + availability + the configured field list). */
export type MobileBookingForm = {
  slug: string | null;
  bookingMode: string;
  /** books_open AND the booking window has not expired (matches the web rule). */
  isOpen: boolean;
  windowExpired: boolean;
  openSlotCount: number;
  /** Fixed-slots mode with zero open slots — the public page appears closed. */
  isFixedSlotsWithoutSlots: boolean;
  allowPhotoAnnotations: boolean;
  fields: MobileBookingFormField[];
};

/** GET /api/mobile/account — account + security overview (mirrors web settings/account). */
export type MobileAccount = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  bookingMode: string;
  /** True when an email+password identity exists (vs OAuth-only sign-in). */
  hasPassword: boolean;
  /** The OAuth provider for no-password accounts (e.g. "google", "apple"), else null. */
  oauthProvider: string | null;
  /** True when a verified TOTP factor is enrolled. */
  mfaEnabled: boolean;
};

/** GET/POST /api/mobile/settings/reminders — the artist's automated reminder
 *  email settings (profiles.settings.reminder_settings), parsed/clamped with
 *  the same rules as the web Emails page and the daily reminder cron. */
export type MobileReminderSettings = {
  deposit_overdue_enabled: boolean;
  appointment_reminder_enabled: boolean;
  /** Days before the appointment (clamped 1-14). */
  appointment_reminder_days: number;
  reconfirmation_enabled: boolean;
  /** Days before the appointment (clamped 3-30). */
  reconfirmation_days: number;
};
