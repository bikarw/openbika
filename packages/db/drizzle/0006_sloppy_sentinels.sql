CREATE TABLE "web_server_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"singleton_key" text DEFAULT 'default' NOT NULL,
	"host" text,
	"https" boolean DEFAULT false NOT NULL,
	"certificate_type" text DEFAULT 'none' NOT NULL,
	"lets_encrypt_email" text,
	"apply_status" text DEFAULT 'not_configured' NOT NULL,
	"last_applied_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "web_server_settings_singleton_key_idx" ON "web_server_settings" USING btree ("singleton_key");