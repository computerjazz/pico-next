import "./env";
import { getGroupScore_deprecated } from "../lib/toggle-score";

async function migrateToggles() {
  const groupId = process.argv[2];
  console.log("groupId", groupId);
  const score = await getGroupScore_deprecated({ groupId });

  console.log("done", groupId, score);
}

migrateToggles();
