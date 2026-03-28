CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_hour" integer NOT NULL,
	"from_minute" integer DEFAULT 0 NOT NULL,
	"to_hour" integer NOT NULL,
	"to_minute" integer DEFAULT 0 NOT NULL,
	"policy_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"override_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;