CREATE TABLE "pico_next_db"."device_shares" (
	"device_id" varchar(100) NOT NULL,
	"user_id" text,
	"redeem_code" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pico_next_db"."device_shares" ADD CONSTRAINT "device_shares_device_id_devices_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "pico_next_db"."devices"("device_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pico_next_db"."device_shares" ADD CONSTRAINT "device_shares_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "pico_next_db"."user"("id") ON DELETE no action ON UPDATE no action;