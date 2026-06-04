CREATE TABLE "pico_next_db"."device_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar(64),
	"device_id" varchar(100) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pico_next_db"."device_groups" ADD CONSTRAINT "device_groups_device_id_devices_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "pico_next_db"."devices"("device_id") ON DELETE no action ON UPDATE no action;