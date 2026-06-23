import "./env";
import { getGroupScore_deprecated } from "../lib/toggle-score";
import { Toggle, toggles } from "../db/schema";
import { db } from "../db";

async function migrateToggles() {
  const groupId = process.argv[2];
  console.log("groupId", groupId);
  if (!groupId) {
    throw new Error("must provide gorupId in order to migrate");
  }
  const score = await getGroupScore_deprecated({
    groupId,
    includeInProgressScore: false,
  });
  const activeDevice = score.devices.find((d) => d.role === "active");
  const targetState = activeDevice?.state || null;
  const devices: Omit<Toggle, "id" | "updatedAt">[] = score.devices.map((d) => {
    const isActive = d.role === "active";
    return {
      groupId,
      state: d.state,
      deviceId: d.deviceId,
      scoreSnapshot: String(d.points),
      targetState,
      scoringSince: isActive ? (d.updatedAt ?? null) : null,
      updatedAt: d.updatedAt ?? null,
    };
  });
  const result = await Promise.all(
    devices.map((d) => {
      return db.insert(toggles).values(d).returning();
    }),
  );
  console.log("done", result);
}

migrateToggles();
