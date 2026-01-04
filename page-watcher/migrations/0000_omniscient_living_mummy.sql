CREATE TABLE "watchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"search_text" text NOT NULL,
	"interval_minutes" integer DEFAULT 1440 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"found_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
