CREATE TABLE "hourly_traffic" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"hour" integer NOT NULL,
	"mac" text NOT NULL,
	"rx" bigint DEFAULT 0 NOT NULL,
	"tx" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hourly_traffic_date_hour_mac_unique" UNIQUE("date","hour","mac")
);
