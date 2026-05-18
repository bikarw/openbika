CREATE TYPE "public"."git_provider_type" AS ENUM('github', 'gitlab', 'bitbucket', 'gitea');--> statement-breakpoint
CREATE TABLE "bitbucket_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"git_provider_id" text NOT NULL,
	"username" text,
	"email" text,
	"app_password" text,
	"api_token" text,
	"workspace_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bitbucket_providers_git_provider_id_unique" UNIQUE("git_provider_id")
);
--> statement-breakpoint
CREATE TABLE "git_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"provider_type" "git_provider_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gitea_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"git_provider_id" text NOT NULL,
	"gitea_url" text DEFAULT 'https://gitea.com' NOT NULL,
	"gitea_internal_url" text,
	"redirect_uri" text,
	"client_id" text,
	"client_secret" text,
	"access_token" text,
	"refresh_token" text,
	"expires_at" integer,
	"scopes" text DEFAULT 'repo,read:user,read:org' NOT NULL,
	"last_authenticated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gitea_providers_git_provider_id_unique" UNIQUE("git_provider_id")
);
--> statement-breakpoint
CREATE TABLE "github_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"git_provider_id" text NOT NULL,
	"app_name" text,
	"app_id" integer,
	"client_id" text,
	"client_secret" text,
	"installation_id" text,
	"private_key" text,
	"webhook_secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_providers_git_provider_id_unique" UNIQUE("git_provider_id")
);
--> statement-breakpoint
CREATE TABLE "gitlab_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"git_provider_id" text NOT NULL,
	"gitlab_url" text DEFAULT 'https://gitlab.com' NOT NULL,
	"gitlab_internal_url" text,
	"application_id" text,
	"redirect_uri" text,
	"secret" text,
	"access_token" text,
	"refresh_token" text,
	"group_name" text,
	"expires_at" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gitlab_providers_git_provider_id_unique" UNIQUE("git_provider_id")
);
--> statement-breakpoint
ALTER TABLE "bitbucket_providers" ADD CONSTRAINT "bitbucket_providers_git_provider_id_git_providers_id_fk" FOREIGN KEY ("git_provider_id") REFERENCES "public"."git_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_providers" ADD CONSTRAINT "git_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitea_providers" ADD CONSTRAINT "gitea_providers_git_provider_id_git_providers_id_fk" FOREIGN KEY ("git_provider_id") REFERENCES "public"."git_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_providers" ADD CONSTRAINT "github_providers_git_provider_id_git_providers_id_fk" FOREIGN KEY ("git_provider_id") REFERENCES "public"."git_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_providers" ADD CONSTRAINT "gitlab_providers_git_provider_id_git_providers_id_fk" FOREIGN KEY ("git_provider_id") REFERENCES "public"."git_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "git_providers_organization_id_idx" ON "git_providers" USING btree ("organization_id");