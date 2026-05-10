ALTER TABLE "database_clusters" DROP CONSTRAINT IF EXISTS "database_clusters_region_id_regions_id_fk";--> statement-breakpoint
ALTER TABLE "database_clusters" DROP COLUMN IF EXISTS "region_id";--> statement-breakpoint
DROP TABLE IF EXISTS "regions";
