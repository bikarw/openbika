CREATE TABLE "s3_destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text,
	"access_key" text NOT NULL,
	"secret_access_key" text NOT NULL,
	"bucket" text NOT NULL,
	"region" text NOT NULL,
	"endpoint" text NOT NULL,
	"additional_flags" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "s3_destinations" ADD CONSTRAINT "s3_destinations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "s3_destinations_organization_id_idx" ON "s3_destinations" USING btree ("organization_id");