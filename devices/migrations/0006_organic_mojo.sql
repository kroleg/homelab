ALTER TABLE "users" ADD COLUMN "quota_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quota_limit_mb" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quota_window_hours" integer DEFAULT 3 NOT NULL;