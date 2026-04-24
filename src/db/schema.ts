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
});

export const bookingImages = pgTable("booking_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookingRequests.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
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
