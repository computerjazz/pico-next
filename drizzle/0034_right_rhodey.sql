CREATE TABLE "pico_next_db"."deck_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"can_send_to" boolean DEFAULT false NOT NULL,
	"can_receive_from" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_contacts_key_unique" UNIQUE("key"),
	CONSTRAINT "deck_contacts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "pico_next_db"."deck_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "deck_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pico_next_db"."deck_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"contact_id" integer,
	"body" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "pico_next_db"."deck_messages" ADD CONSTRAINT "deck_messages_contact_id_deck_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "pico_next_db"."deck_contacts"("id") ON DELETE no action ON UPDATE no action;