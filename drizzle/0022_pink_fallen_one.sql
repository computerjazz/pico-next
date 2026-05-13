CREATE TABLE "pico_next_db"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(24),
	"platform_id" varchar(100),
	"recording_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now()
);
