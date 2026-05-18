ALTER TYPE "public"."workload_kind" ADD VALUE 'unconfigured' BEFORE 'container';--> statement-breakpoint
ALTER TYPE "public"."workload_status" ADD VALUE 'draft' BEFORE 'requested';