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
  serial,
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
  role: text("role", { enum: ["user", "admin"] })
    .notNull()
    .default("user"),
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

export const deviceShares = pico.table("device_shares", {
  deviceId: varchar("device_id", { length: 100 })
    .notNull()
    .references(() => devices.deviceId),
  userId: text("user_id").references(() => users.id),
  redeemCode: uuid("redeem_code").primaryKey().defaultRandom(),
  redeemCodeExpiresAt: timestamp("redeem_code_expires_at", {
    mode: "date",
    withTimezone: true,
  }).$defaultFn(() => new Date(Date.now() + 24 * 60 * 60 * 1000)),
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
  isShared: boolean("is_shared").default(false),
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
  targetState: varchar("target_state", { length: 10 }),
  scoreSnapshot: numeric("score_snapshot").notNull().default("0"),
  scoringSince: timestamp("scoring_since", {
    mode: "date",
    withTimezone: true,
  }),
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

export const deckContacts = pico.table("deck_contacts", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // "mom", "dad"
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(), // store lowercased
  canSendTo: boolean("can_send_to").notNull().default(false),
  canReceiveFrom: boolean("can_receive_from").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const deckDevices = pico.table("deck_devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(), // sha256 of the device token
  revokedAt: timestamp("revoked_at"),
});

export const deckMessages = pico.table("deck_messages", {
  id: serial("id").primaryKey(),
  direction: text("direction").notNull(), // "in" | "out"
  contactId: integer("contact_id").references(() => deckContacts.id),
  body: text("body").notNull(),
  status: text("status").notNull().default("ok"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
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

export const deviceShareRelations = relations(deviceShares, ({ one }) => {
  return {
    device: one(devices, {
      fields: [deviceShares.deviceId],
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
