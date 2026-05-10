CREATE TYPE "public"."branch_copy_mode" AS ENUM('schema_only', 'schema_and_data');--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "copy_mode" "branch_copy_mode" DEFAULT 'schema_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "expires_at" timestamp with time zone;