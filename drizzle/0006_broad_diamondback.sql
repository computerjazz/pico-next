CREATE TABLE "pico_next_db"."recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"filepath" varchar(256) NOT NULL,
	"device_id" varchar(100),
	"name" varchar(100),
	"content_type" varchar(25)
);
