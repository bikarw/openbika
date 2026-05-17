CREATE TABLE "backup_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"cluster_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"s3_destination_id" text NOT NULL,
	"name" text NOT NULL,
	"cron_expression" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD COLUMN "branch_id" text;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD COLUMN "s3_destination_id" text;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD COLUMN "schedule_id" text;--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_cluster_id_database_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."database_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_s3_destination_id_s3_destinations_id_fk" FOREIGN KEY ("s3_destination_id") REFERENCES "public"."s3_destinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_schedules_cluster_idx" ON "backup_schedules" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "backup_schedules_enabled_next_run_idx" ON "backup_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "backup_schedules_branch_name_idx" ON "backup_schedules" USING btree ("branch_id","name");--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_s3_destination_id_s3_destinations_id_fk" FOREIGN KEY ("s3_destination_id") REFERENCES "public"."s3_destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_jobs_cluster_branch_created_at_idx" ON "backup_jobs" USING btree ("cluster_id","branch_id","created_at");