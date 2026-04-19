CREATE TYPE "public"."booking_mode" AS ENUM('preferred_date', 'fixed_slots');--> statement-breakpoint
CREATE TYPE "public"."booking_origin" AS ENUM('public_form', 'artist_created');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'approved', 'rejected', 'deposit_pending', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_template_type" AS ENUM('customer_booking_submitted', 'customer_booking_approved', 'customer_booking_rejected', 'customer_booking_cancelled_by_artist', 'artist_new_booking_request');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('open', 'locked', 'booked', 'cancelled');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"action" text NOT NULL,
	"actor" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "booking_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"form_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"preferred_date" date,
	"slot_id" uuid,
	"customer_email" text,
	"customer_handle" text,
	"customer_token_hash" text,
	"origin" "booking_origin" DEFAULT 'public_form' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"type" "email_template_type" NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"instagram_handle" text,
	"bio" text,
	"logo_url" text,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"location" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"booking_mode" "booking_mode" DEFAULT 'preferred_date' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "slot_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_booking_id_booking_requests_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_images" ADD CONSTRAINT "booking_images_booking_id_booking_requests_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_artist_id_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_artist_id_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_artist_id_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;