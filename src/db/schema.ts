import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  date,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";

// --- Enums ---

export const bookingModeEnum = pgEnum("booking_mode", [
  "preferred_date",
  "fixed_slots",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "approved",
  "rejected",
  "deposit_pending",
  "cancelled",
]);

export const bookingOriginEnum = pgEnum("booking_origin", [
  "public_form",
  "artist_created",
]);

export const slotStatusEnum = pgEnum("slot_status", [
  "open",
  "locked",
  "booked",
  "cancelled",
]);

export const emailTemplateTypeEnum = pgEnum("email_template_type", [
  "customer_booking_submitted",
  "customer_booking_approved",
  "customer_booking_rejected",
  "customer_booking_cancelled_by_artist",
  "artist_new_booking_request",
]);

// --- Tables ---

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // FK to auth.users
  slug: text("slug").unique().notNull(),
  displayName: text("display_name").notNull(),
  instagramHandle: text("instagram_handle"),
  bio: text("bio"),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  location: text("location"),
  settings: jsonb("settings").default({}),
  bookingMode: bookingModeEnum("booking_mode")
    .notNull()
    .default("preferred_date"),
  isTester: boolean("is_tester").notNull().default(false),
  accountStatus: text("account_status").notNull().default("active"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bookingRequests = pgTable("booking_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  status: bookingStatusEnum("status").notNull().default("pending"),
  formData: jsonb("form_data").notNull().default({}),
  preferredDate: date("preferred_date"),
  slotId: uuid("slot_id"),
  travelLegId: uuid("travel_leg_id").references(() => travelLegs.id, {
    onDelete: "set null",
  }),
  tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
  customerEmail: text("customer_email"),
  customerHandle: text("customer_handle"),
  customerTokenHash: text("customer_token_hash"),
  origin: bookingOriginEnum("origin").notNull().default("public_form"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }),
  depositDueAt: date("deposit_due_at"),
  depositNote: text("deposit_note"),
  depositPaymentIntentId: text("deposit_payment_intent_id"),
  depositClientSecret: text("deposit_client_secret"),
  depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
  // Flash — set when a booking originates from a flash item
  flashItemId: uuid("flash_item_id").references(() => flashItems.id, {
    onDelete: "set null",
  }),
  flashDayId: uuid("flash_day_id").references(() => flashDays.id, {
    onDelete: "set null",
  }),
});

export const bookingImages = pgTable("booking_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookingRequests.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type").notNull().default("image/webp"),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  annotations: jsonb("annotations"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const slots = pgTable("slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  status: slotStatusEnum("status").notNull().default("open"),
});

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: emailTemplateTypeEnum("type").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").references(() => bookingRequests.id, {
    onDelete: "cascade",
  }),
  action: text("action").notNull(),
  actor: uuid("actor"),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
  details: jsonb("details").default({}),
});

export const customFields = pgTable("custom_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(),
  required: boolean("required").notNull().default(false),
  placeholder: text("placeholder"),
  helpText: text("help_text"),
  options: jsonb("options").notNull().default([]),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const travelLegs = pgTable("travel_legs", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  city: text("city").notNull(),
  country: text("country").notNull(),
  studioName: text("studio_name"),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const studios = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  showOnBookingForm: boolean("show_on_booking_form").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tripLegs = pgTable("trip_legs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  studioId: uuid("studio_id").references(() => studios.id, {
    onDelete: "set null",
  }),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const waitlistStatusEnum = pgEnum("waitlist_status", [
  "waiting",
  "contacted",
  "converted",
  "dismissed",
]);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  customerEmail: text("customer_email").notNull(),
  customerHandle: text("customer_handle").notNull(),
  note: text("note"),
  status: waitlistStatusEnum("status").notNull().default("waiting"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const flashDays = pgTable("flash_days", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  scheduledOn: date("scheduled_on"),
  location: text("location"),
  description: text("description"),
  status: text("status").notNull().default("upcoming"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const instagramAccounts = pgTable("instagram_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  instagramUserId: text("instagram_user_id").notNull(),
  username: text("username").notNull(),
  accessToken: text("access_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  connected: boolean("connected").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const instagramPosts = pgTable("instagram_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  instagramMediaId: text("instagram_media_id").notNull(),
  mediaType: text("media_type").notNull().default("IMAGE"),
  mediaUrl: text("media_url"),
  thumbnailUrl: text("thumbnail_url"),
  permalink: text("permalink").notNull(),
  caption: text("caption"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const flashItems = pgTable("flash_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("draft"),
  instagramPostUrl: text("instagram_post_url"),
  previewImageUrl: text("preview_image_url"),
  shortDescription: text("short_description"),
  priceType: text("price_type").notNull().default("request"),
  price: numeric("price", { precision: 10, scale: 2 }),
  sizeInfo: text("size_info"),
  placementNotes: text("placement_notes"),
  bookingMode: text("booking_mode").notNull().default("unique"),
  maxBookings: integer("max_bookings"),
  isBookable: boolean("is_bookable").notNull().default(true),
  availableFrom: date("available_from"),
  availableUntil: date("available_until"),
  flashDayId: uuid("flash_day_id").references(() => flashDays.id, {
    onDelete: "set null",
  }),
  instagramPostId: uuid("instagram_post_id").references(
    () => instagramPosts.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clientNotes = pgTable("client_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  customerEmail: text("customer_email").notNull(),
  notes: text("notes").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("medium"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  ctaLabel: text("cta_label"),
  ctaHref: text("cta_href"),
  isRead: boolean("is_read").notNull().default(false),
  isResolved: boolean("is_resolved"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Admin action log — all account control actions by admins are recorded here.
// Not artist-facing. Accessible only via service role.
export const adminActionLog = pgTable("admin_action_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id").notNull(),
  targetUserId: uuid("target_user_id"),
  action: text("action").notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
