import { CHANNEL_TYPE } from "../lib/constants";
import { relations } from "drizzle-orm";
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  varchar,
  numeric,
  integer,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { AdapterAccountType } from "next-auth/adapters";

// Schema definition
const pico = pgSchema("pico_next_db");

// Tables

// authjs schema: https://authjs.dev/getting-started/adapters/drizzle
export const users = pico.table("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

// authjs schema
export const accounts = pico.table(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    {
      compoundKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    },
  ],
);

// authjs schema
export const sessions = pico.table("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// authjs schema
export const verificationTokens = pico.table(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    {
      compositePk: primaryKey({
        columns: [verificationToken.identifier, verificationToken.token],
      }),
    },
  ],
);

// authjs schema
export const authenticators = pico.table(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: boolean("credentialBackedUp").notNull(),
    transports: text("transports"),
  },
  (authenticator) => [
    {
      compositePK: primaryKey({
        columns: [authenticator.userId, authenticator.credentialID],
      }),
    },
  ],
);

export const devices = pico.table("devices", {
  deviceId: varchar("device_id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 50 }),
  volume: numeric("volume"),
  isPublic: boolean("is_public").default(false),
  type: varchar("type", { length: 50 }).notNull(),
  firmwareVersion: varchar("firmware_version", { length: 50 }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
  lastSeenAt: timestamp("last_seen_at", {
    mode: "date",
    withTimezone: true,
  }),
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

export const deviceGroups = pico.table("device_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: varchar("group_id", { length: 64 }),
  deviceId: varchar("device_id", { length: 100 })
    .notNull()
    .references(() => devices.deviceId),
});

export const recordings = pico.table("recordings", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: varchar("device_id", { length: 100 }),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
  filepath: varchar("filepath", { length: 512 }).notNull(),
  filepathProcessed: varchar("filepath_processed", { length: 512 }),
  name: varchar("name", { length: 512 }),
  contentType: varchar("content_type", { length: 25 }),
  source: varchar("source", { length: 25 }),
  transcript: text("transcript"),
  durationMillis: varchar("duration_millis", { length: 25 }),
  deletedAt: timestamp("deleted_at", {
    mode: "date",
    withTimezone: true,
  }),
});

export const messages = pico.table("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: varchar("platform", { length: 64 }),
  platformMessageId: varchar("platform_message_id", { length: 100 }),
  deviceChannelId: varchar("device_channel_id", { length: 100 }),
  recordingId: varchar("recording_id", { length: 64 }),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).defaultNow(),
});

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

export const pushSubscriptions = pico.table("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpoint: text("endpoint").unique().notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
});

// Relations
export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, {
    fields: [devices.userId],
    references: [users.id],
  }),
  deviceChannels: many(deviceChannels),
}));

export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
}));

export const deviceChannelsRelations = relations(
  deviceChannels,
  ({ one, many }) => {
    return {
      device: one(devices, {
        fields: [deviceChannels.deviceId],
        references: [devices.deviceId],
      }),
      messages: many(messages),
    };
  },
);

export const deviceGroupRelations = relations(deviceGroups, ({ one }) => {
  return {
    device: one(devices, {
      fields: [deviceGroups.deviceId],
      references: [devices.deviceId],
    }),
  };
});

export const recordingsRelations = relations(recordings, ({ one, many }) => ({
  device: one(devices, {
    fields: [recordings.deviceId],
    references: [devices.deviceId],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  recording: one(recordings, {
    fields: [messages.recordingId],
    references: [recordings.id],
  }),
  deviceChannel: one(deviceChannels, {
    fields: [messages.deviceChannelId],
    references: [deviceChannels.channelId],
  }),
}));

export const togglesRelations = relations(toggles, ({ one }) => ({
  device: one(devices, {
    fields: [toggles.deviceId],
    references: [devices.deviceId],
  }),
}));

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => {
    return {
      user: one(users, {
        fields: [pushSubscriptions.userId],
        references: [users.id],
      }),
    };
  },
);

export type Device = typeof devices.$inferSelect;
export type DeviceChannel = typeof deviceChannels.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
export type Toggle = typeof toggles.$inferSelect;
export type User = typeof users.$inferSelect;
