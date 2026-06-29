// Response shapes for the GET /api/mobile/* read endpoints — the single source
// of truth shared by the server route handlers (apps/web) and the screens that
// consume them (apps/mobile). Each route builds its JSON as a typed const of the
// matching type here, and each screen types its fetch with the same type, so the
// two sides cannot drift. These describe ONLY the `data` payload — the route
// helpers wrap it in the `{ data }` / `{ error }` envelope.

import type { AnalyticsMetrics } from "./analytics";
import type { BooksSettings } from "./books-settings";
import type { CustomFieldType } from "./custom-fields";
import type { DashboardWidgets } from "./dashboard-settings";
import type { DepositState } from "./deposit-state";
import type { StripeMode } from "./deposit-settings";

/** GET /api/mobile/me — the signed-in artist's identity + plan/entitlement state. */
export type MobileMe = {
  userId: string;
  slug: string | null;
  displayName: string | null;
  timezone: string;
  bookingMode: string;
  /** EFFECTIVE open state (books_open AND the booking window hasn't expired) —
   *  matches /home. Cap-reached / slots-closed states are NOT reflected, so a
   *  full book can still show open here while the public page shows closed. */
  booksOpen: boolean;
  /** The raw books_open flag the artist controls (the quick-toggle Switch). */
  booksOpenFlag: boolean;
  /** True when a booking window end date has passed — books show closed even
   *  while the flag is on (the quick sheet explains this). */
  bookingWindowExpired: boolean;
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
  /** Server-computed card-routing gate (account exists AND status active AND
   *  charges enabled) — the same rule web derives via getConnectRoutingForArtist,
   *  so the client never reconstructs it from looser flags. */
  routeCharges: boolean;
  /** Classification of the deployment's Stripe publishable key (the key itself
   *  never ships to the device); "test" drives the test-mode deposits banner. */
  stripeMode: StripeMode;
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
  /** Library icon key of the parent trip (artist-side display only). */
  icon?: string | null;
  /** Chosen icon color (hex) or null/absent = default color. */
  iconColor?: string | null;
  id: string;
  tripId: string;
  tripTitle: string;
  studioName: string | null;
  startsOn: string;
  endsOn: string;
};

/** One item in the Home "Action required" feed. A discriminated union so each
 *  row carries exactly the data its inline quick action + display need, letting
 *  the feed render and act without a detail round-trip. Built + ranked server-side. */
export type MobileActionItem =
  | {
      kind: "request";
      bookingId: string;
      client: string;
      placement: string | null;
      preferredDate: string | null;
    }
  | {
      kind: "deposit";
      bookingId: string;
      client: string;
      amount: number;
      currency: string;
      dueAt: string | null;
      overdue: boolean;
    };

/** GET /api/mobile/home — the dashboard aggregate backing the Home widget grid. */
export type MobileHome = {
  displayName: string | null;
  slug: string | null;
  bio: string | null;
  booksOpen: boolean;
  onboardingCompleted: boolean;
  /** Today's date-key (YYYY-MM-DD) in the ARTIST's timezone, for the Home
   *  greeting date. Server-provided so a travelling artist sees the same "today"
   *  as the web dashboard and the client never touches Intl (Hermes iOS has
   *  none). Optional for version skew: older servers omit it and the app falls
   *  back to the device-local day. */
  todayKey?: string;
  /** Per-widget visibility (mirrors the web dashboard widget toggles). */
  dashboardWidgets: DashboardWidgets;
  pendingCount: number;
  pending: MobileHomeBooking[];
  upcoming: MobileHomeBooking[];
  /** Total upcoming appointments (the list above is capped at 3). Optional for
   *  version skew — older servers don't send it; fall back to upcoming.length. */
  upcomingCount?: number;
  guestSpots: MobileGuestSpot[];
  waitlistCount: number;
  /** Total requests ever received — drives the zero-request "share your link"
   *  convenience (force-show the links widget for brand-new artists). */
  totalReceivedCount: number;
  /** Requests received since the 1st of the current month (artist timezone).
   *  Optional for version skew (older servers omit it). */
  thisMonthCount?: number;
  /** Unpaid deposits awaiting payment (card + manual). The "Deposits due" glance
   *  satellite; shown only when > 0. */
  depositsOutstandingCount?: number;
  /** Subset of the above past their due date (drives the danger tint). */
  depositsOverdueCount?: number;
  /** Ranked "Action required" feed: overdue manual deposits, then oldest pending
   *  requests, then awaiting manual deposits. Capped server-side. */
  actionItems?: MobileActionItem[];
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

/** GET /api/mobile/bookings/stats — the Requests-tab big-number strip.
 *  Counts are NOT widget-gated (unlike /home), so they're safe for the
 *  bookings tab regardless of dashboard settings. */
export type MobileBookingStats = {
  /** Requests awaiting a reply (status = pending). */
  pendingCount: number;
  /** Accepted appointments dated today or later (mirrors the web dashboard). */
  upcomingCount: number;
  /** Requests received since the 1st of the current month. */
  thisMonthCount: number;
};

/** One deposit across the artist's bookings (GET /api/mobile/bookings/deposits).
 *  `state` is derived server-side from the deposit columns plus the refund
 *  audit log; `card` distinguishes an in-app card deposit from a manual one. */
export type MobileDepositListItem = {
  bookingId: string;
  client: string;
  amount: number;
  currency: string;
  dueAt: string | null;
  paidAt: string | null;
  /** Single-sourced via the shared `depositState` classifier. `cancelled` = an
   *  unpaid deposit on a dead/settled booking (the client or artist cancelled,
   *  or the artist accepted without it) — kept for reference, counted in NONE of
   *  the rollups. */
  state: DepositState;
  card: boolean;
  /** Relative due label ("due in 3 days" / "5 days overdue"), server-computed
   *  for awaiting + overdue rows; null for settled (paid/refunded/cancelled). */
  dueLabel: string | null;
};

/** GET /api/mobile/bookings/deposits — the deposits overview: every booking
 *  that carries a deposit, plus outstanding / collected rollups for the header.
 *  Amounts assume the artist's single payout currency. */
export type MobileDepositsResponse = {
  items: MobileDepositListItem[];
  summary: {
    currency: string;
    outstandingCount: number;
    outstandingAmount: number;
    /** Overdue is a subset of outstanding, broken out so the chase view can
     *  surface the urgent figure louder than the not-yet-due remainder. */
    overdueCount: number;
    overdueAmount: number;
    collectedCount: number;
    collectedAmount: number;
  };
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
  /** Lifecycle state from the shared `depositState` classifier — the SAME value
   *  the deposits overview shows, so the detail card can't disagree with it. */
  state: DepositState;
};

/** One client annotation pinned on a reference image (normalized 0..1 coords). */
export type MobileImageAnnotation = {
  id: string;
  x: number;
  y: number;
  comment: string;
};

/** One reference image on a booking, signed for in-app display (1h TTL). */
export type MobileBookingImage = {
  url: string;
  width: number | null;
  height: number | null;
  annotations: MobileImageAnnotation[] | null;
};

/** One artist-visible activity event on a booking (audit_log row, labeled
 *  server-side via @inklee/shared/booking-activity — raw details never ship
 *  to the device: they can carry IPs, token hashes and Stripe internals). */
export type MobileBookingTimelineEvent = {
  action: string;
  kind: import("./booking-activity").BookingActivityKind;
  label: string;
  /** audit_log.timestamp, ISO. Newest first; clients must not re-sort. */
  at: string;
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
  /** The artist's custom booking-form questions + the client's answers, each
   *  pre-formatted server-side (formatCustomAnswer uses Intl for dates, which
   *  Hermes iOS lacks, so the client must not re-format). Optional for version
   *  skew: older servers omit it. */
  customAnswers?: { label: string; value: string }[];
  referenceLink: string | null;
  /** @deprecated Raw storage paths; kept so older installed builds don't crash.
   *  New code reads referenceImages (signed URLs). */
  referenceImagePaths: string[];
  referenceImages: MobileBookingImage[];
  /** Optional for version skew: older deployed APIs omit it. */
  timeline?: MobileBookingTimelineEvent[];
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

/** One flash day with a date, for calendar markers (scheduledOn non-null by
 *  query; do not reuse the nullable flash-day option type). */
export type MobileCalendarFlashDay = {
  id: string;
  title: string;
  scheduledOn: string;
};

/** GET /api/mobile/calendar?from=&to= — confirmed appointments in the range,
 *  plus guest-spot legs and flash days for the marker enrichment. The two
 *  extra fields are OPTIONAL on purpose: that is the version-skew contract
 *  (a new app against an older API degrades to appointments-only). */
export type MobileCalendarResponse = {
  items: MobileCalendarAppointment[];
  guestSpots?: MobileGuestSpot[];
  flashDays?: MobileCalendarFlashDay[];
};

/** One waitlist entry (GET /api/mobile/waitlist, GET /api/mobile/waitlist/:id). */
export type MobileWaitlistEntry = {
  id: string;
  customer_email: string;
  customer_handle: string;
  note: string | null;
  /** Freetext city from the public waitlist form (max 100 chars). */
  city_text: string | null;
  status: string; // waiting | contacted | converted | dismissed
  created_at: string;
};

/** GET /api/mobile/waitlist?status= — the artist's waitlist entries. */
export type MobileWaitlistResponse = {
  items: MobileWaitlistEntry[];
};

/** GET /api/mobile/analytics?range=30|90|all — headline booking metrics. The
 *  metric shape is the shared AnalyticsMetrics (one source with the web page +
 *  the computeAnalytics core); the route adds the echoed `range`. */
export type MobileAnalytics = AnalyticsMetrics & { range: string };

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
  slug: string;
  status: string; // draft | published | archived
  priceType: string; // fixed | from | request
  price: number | null;
  currency: string; // iso code, e.g. "eur"
  isBookable: boolean;
  previewImageUrl: string | null;
  bookingMode: string; // unique | limited | repeatable
  folderId: string | null;
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

/** GET /api/mobile/flash/items/:id — full editable item. Day membership lives in
 *  the flash_day_items junction (dayMemberships = the day ids this design is in);
 *  folderId is the design's library folder. */
export type MobileFlashItemDetail = {
  id: string;
  title: string;
  slug: string;
  status: string;
  priceType: string;
  price: number | null;
  currency: string; // iso code, e.g. "eur"
  shortDescription: string | null;
  sizeInfo: string | null;
  placementNotes: string | null;
  bookingMode: string;
  maxBookings: number | null;
  isBookable: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  folderId: string | null;
  dayMemberships: string[];
  previewImageUrl: string | null;
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
  studioId: string | null;
  location: string | null;
  description: string | null;
  status: string; // upcoming | active | past | cancelled
  isPublic: boolean;
  itemCount: number;
};

export type MobileFlashDaysResponse = { items: MobileFlashDay[] };

/** A design-library folder (GET/POST /api/mobile/flash/folders). */
export type MobileFlashFolder = { id: string; name: string; position: number };
export type MobileFlashFoldersResponse = { folders: MobileFlashFolder[] };

/** One design in a day's roster (GET /api/mobile/flash/days/:id/items). */
export type MobileFlashDayItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  previewImageUrl: string | null;
  position: number;
};
export type MobileFlashDayItemsResponse = { items: MobileFlashDayItem[] };

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
  /** Library icon key (artist-side display only); null/absent = default glyph. */
  icon?: string | null;
  /** Chosen icon color (hex) or null/absent = default color. */
  iconColor?: string | null;
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
  /** Library icon key (artist-side display only); null/absent = default glyph. */
  icon?: string | null;
  /** Chosen icon color (hex) or null/absent = default color. */
  iconColor?: string | null;
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

/** One product variant ("option": size, colour, …). priceOverride null =
 *  product price; stock null = unlimited. */
export type MobileProductVariant = {
  id: string;
  name: string;
  priceOverride: number | null;
  stock: number | null;
};

/** One row of a PUT /api/mobile/goods/:id/variants payload. id null = new
 *  row; an existing id MUST round-trip so the server reconciles in place
 *  (delete-and-recreate would orphan historical order/interest pointers). */
export type MobileProductVariantInput = {
  id: string | null;
  name: string;
  priceOverride: number | null;
  stock: number | null;
};

/** PUT /api/mobile/goods/:id/variants — the whole displayed list, like the
 *  web form posts it. Rows the server no longer sees get archived or deleted
 *  (non-destructive reconcile). */
export type MobileProductVariantsUpdate = {
  variants: MobileProductVariantInput[];
};

/** PUT /api/mobile/goods/:id/variants response — the canonical saved list
 *  (ids included so the client reseeds and future saves round-trip them). */
export type MobileProductVariantsResult = {
  variants: MobileProductVariant[];
};

/** GET /api/mobile/goods/:id — the full editable product. */
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
  /** Legacy hero (imageUrls[0]); prefer imageUrls. */
  imageUrl: string | null;
  /** Canonical ordered image list — first entry is the hero everywhere. */
  imageUrls: string[];
  /** Active variants in display order (hidden archived rows excluded). */
  variants: MobileProductVariant[];
  /** Server-computed image cap: variantCount + 1 when variants exist, else 3
   *  (the shared maxProductImages rule). The client recomputes live while
   *  editing variant rows; the server stays authoritative on upload. */
  maxImages: number;
};

/** GET /api/mobile/travel/trips/:id — a trip with its legs + the artist's studios. */
export type MobileTripDetail = {
  id: string;
  title: string;
  description: string | null;
  showOnBookingForm: boolean;
  legs: MobileTripLeg[];
  studios: MobileStudioOption[];
  /** Library icon key (artist-side display only); null/absent = default glyph. */
  icon?: string | null;
  /** Chosen icon color (hex) or null/absent = default color. */
  iconColor?: string | null;
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

/** An extra per-row toggle beyond show/require (today only the image_upload
 *  row's "Photo annotations" — allow_photo_annotations). */
export type MobileBookingFormExtraToggle = {
  /** FormSettings key the toggle writes via POST /booking-form/settings. */
  key: string;
  label: string;
  value: boolean;
};

/** One row in the mobile booking-form editor: standard + custom fields
 *  interleaved in the artist's saved field order. The editor-projection fields
 *  (showSettingKey…custom) were added for the native editor; older read-only
 *  clients ignore them. */
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
  /** FormSettings visibility key (e.g. "show_placement"); null when alwaysOn
   *  or custom (custom rows toggle via /booking-form/fields/:id/active). */
  showSettingKey: string | null;
  /** FormSettings required key (e.g. "require_placement"); null for email,
   *  preferred_date and custom rows. */
  requireSettingKey: string | null;
  /** Email only: required can never be turned off. */
  lockedRequired: boolean;
  extraToggles: MobileBookingFormExtraToggle[];
  /** Full editor payload for custom rows; null for standard rows. */
  custom: {
    key: string;
    type: CustomFieldType;
    placeholder: string | null;
    helpText: string | null;
    options: string[];
  } | null;
};

/** GET /api/mobile/booking-form — aggregate for the booking-form editor screen
 *  (share link + availability + the editable field list). */
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

/** POST /api/mobile/booking-form/fields (create) and
 *  PATCH /api/mobile/booking-form/fields/:id (update) — validated server-side
 *  with the same fieldConfigSchema the web actions use. `key`: omit on create
 *  (the server derives it from the label via labelToKey, like the web's hidden
 *  input); send the stored key on update (validated, never written). */
export type MobileBookingFormFieldInput = {
  key?: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  help_text?: string;
  options?: string[];
};

/** POST /api/mobile/booking-form/settings — one FormSettings boolean
 *  (show_* / require_* / allow_photo_annotations). */
export type MobileBookingFormSettingsUpdate = {
  key: string;
  value: boolean;
};

/** POST /api/mobile/booking-form/order — the full displayed key array
 *  (standard ids + custom uuids), persisted verbatim like the web drag-drop. */
export type MobileBookingFormOrderUpdate = {
  order: string[];
};

/** GET /api/mobile/settings/books — the books settings form plus the
 *  booking-mode section's read side (mode + open-slot count for the
 *  fixed-slots-without-slots warning). */
export type MobileBooksSettings = BooksSettings & {
  bookingMode: string;
  openSlotCount: number;
};

/** POST /api/mobile/settings/booking-mode — the saved mode plus the warning
 *  state so the client can render it without refetching /booking-form. */
export type MobileBookingModeUpdate = {
  bookingMode: string;
  openSlotCount: number;
  isFixedSlotsWithoutSlots: boolean;
};

/** One bookable time slot, display-ready: the server formats date/time labels
 *  in the ARTIST'S profile timezone via the shared formatSlotDisplay (Hermes
 *  iOS has no Intl, so the client never does timezone math). */
export type MobileSlot = {
  id: string;
  /** ISO UTC instant, for reference/sorting. */
  startsAt: string;
  /** YYYY-MM-DD in the artist's timezone — the list's grouping key. */
  dateKey: string;
  /** e.g. "Thu 16 Jul 2026" (same formatting as the web slot list). */
  dateLabel: string;
  /** e.g. "14:00 (60 min)" (same formatting as the web slot list). */
  timeLabel: string;
  durationMinutes: number;
  /** "open" | "locked" | "booked" — label via slotStatusLabel. Only open
   *  slots can be deleted. */
  status: string;
};

/** GET /api/mobile/slots — the artist's slot list + the timezone the labels
 *  are rendered in. */
export type MobileSlotsResponse = {
  timezone: string;
  items: MobileSlot[];
};

/** POST /api/mobile/slots/pattern — how many slots the pattern created.
 *  The request body is the shared SlotPatternInput (@inklee/shared/slot-pattern),
 *  validated server-side with the same validateSlotPattern the web action uses. */
export type MobileSlotPatternResult = {
  count: number;
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

/** GET/POST/DELETE /api/mobile/settings/calendar-export — the private iCal
 *  feed link (null when no token exists). The server builds the full URL so
 *  the client never learns about token storage. */
export type MobileCalendarExport = {
  feedUrl: string | null;
};
