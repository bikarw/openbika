ALTER TABLE "backup_jobs" ADD COLUMN "path_prefix" text;--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD COLUMN "path_prefix" text;--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD COLUMN "retention_keep_last" integer;