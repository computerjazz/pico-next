/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'pico_next_db'
                AND table_name = 'toggles'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "toggles" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "pico_next_db"."toggles" DROP CONSTRAINT "toggle_states_pkey";
ALTER TABLE "pico_next_db"."toggles" ALTER COLUMN "device_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pico_next_db"."toggles" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;