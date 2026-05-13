ALTER TABLE "pico_next_db"."messages" ADD COLUMN "platform_message_id" varchar(100);--> statement-breakpoint
ALTER TABLE "pico_next_db"."messages" ADD COLUMN "device_channel_id" varchar(100);--> statement-breakpoint
ALTER TABLE "pico_next_db"."messages" DROP COLUMN "platform_id";