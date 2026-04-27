CREATE TABLE "pico_next_db"."toggle_states" (
	"device_id" varchar(100) PRIMARY KEY NOT NULL,
	"state" varchar(50) DEFAULT 'off' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
