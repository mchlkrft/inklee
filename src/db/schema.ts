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
});

export const bookingImages = pgTable("booking_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookingRequests.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
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
