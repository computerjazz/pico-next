import { CHANNEL_TYPE } from "@/lib/constants";
import { pgSchema, uuid, text, timestamp, varchar } from "drizzle-orm/pg-core";

// define the schema
const pico = pgSchema("pico_next_db");

// define the table inside that schema
export const users = pico.table("users", {
  id: uuid("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull(),
  email: varchar("email", { length: 100 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const devices = pico.table("devices", {
  deviceId: varchar("device_id", { length: 100 }).primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deviceChannels = pico.table("device_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: varchar("device_id", { length: 100 })
    .notNull()
    .references(() => devices.deviceId),
  channelId: varchar("channel_id", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 })
    .notNull()
    .default(CHANNEL_TYPE.TELEGRAM),
  createdAt: timestamp("created_at").defaultNow(),
});

export const toggles = pico.table("toggles", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: varchar("device_id", { length: 100 }),
  groupId: varchar("group_id", { length: 100 }),
  state: varchar("state", { length: 50 }).notNull().default("off"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
