import { CHANNEL_TYPE } from "@/lib/constants";
import { relations } from "drizzle-orm";
import { pgSchema, uuid, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Schema definition
const pico = pgSchema("pico_next_db");

// Tables
export const users = pico.table("users", {
  id: uuid("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull(),
  email: varchar("email", { length: 100 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
});

export const devices = pico.table("devices", {
  deviceId: varchar("device_id", { length: 100 }).primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  firmwareVersion: varchar("firmware_version", { length: 50 }),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
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
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
});

export const recordings = pico.table("recordings", {
  id: uuid("id").primaryKey().defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
  filepath: varchar("filepath", { length: 256 }).notNull(),
  deviceId: varchar("device_id", { length: 100 }),
  name: varchar("name", { length: 100 }),
  contentType: varchar("content_type", { length: 25 }),
  source: varchar("source", { length: 25 }),
});

// Relations
export const devicesRelations = relations(devices, ({ many }) => {
  return {
    deviceChannels: many(deviceChannels),
  };
});

export const deviceChannelsRelations = relations(deviceChannels, ({ one }) => {
  return {
    device: one(devices, {
      fields: [deviceChannels.deviceId],
      references: [devices.deviceId],
    }),
  };
});

export const recordingsRelations = relations(recordings, ({ one }) => ({
  device: one(devices, {
    fields: [recordings.deviceId],
    references: [devices.deviceId],
  }),
}));

export const toggles = pico.table("toggles", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: varchar("device_id", { length: 100 }),
  groupId: varchar("group_id", { length: 100 }),
  state: varchar("state", { length: 50 }).notNull().default("off"),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
});
