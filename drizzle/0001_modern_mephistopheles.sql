CREATE TABLE "pico_next_db"."device_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" varchar(100) NOT NULL,
	"channel_id" varchar(100) NOT NULL,
	"type" varchar(50) DEFAULT 'telegram' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pico_next_db"."devices" (
	"device_id" varchar(100) PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DROP TABLE "pico_next_db"."shortwave_devices" CASCADE;--> statement-breakpoint
ALTER TABLE "pico_next_db"."device_channels" ADD CONSTRAINT "device_channels_device_id_devices_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "pico_next_db"."devices"("device_id") ON DELETE no action ON UPDATE no action;