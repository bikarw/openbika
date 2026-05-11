CREATE TYPE "public"."workload_kind" AS ENUM('container', 'function');--> statement-breakpoint
CREATE TYPE "public"."workload_status" AS ENUM('requested', 'provisioning', 'available', 'degraded', 'maintenance', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "project_workloads" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "workload_kind" NOT NULL,
	"status" "workload_status" DEFAULT 'requested' NOT NULL,
	"desired_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_workloads" ADD CONSTRAINT "project_workloads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_workloads_project_name_idx" ON "project_workloads" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "project_workloads_status_idx" ON "project_workloads" USING btree ("status");