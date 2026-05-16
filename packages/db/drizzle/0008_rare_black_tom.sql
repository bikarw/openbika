DROP INDEX "endpoints_hostname_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "endpoints_cluster_hostname_port_idx" ON "endpoints" USING btree ("cluster_id","hostname","port");