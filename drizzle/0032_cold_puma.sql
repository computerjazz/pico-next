ALTER TABLE "pico_next_db"."toggles" ADD COLUMN "target_state" varchar(10);--> statement-breakpoint
ALTER TABLE "pico_next_db"."toggles" ADD COLUMN "score_snapshot" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "pico_next_db"."toggles" ADD COLUMN "scoring_since" timestamp with time zone;