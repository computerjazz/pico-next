"use server";
import { getGroupScore } from "@/lib/toggle-score";

export async function fetchGroupScoreAction({ groupId }: { groupId: string }) {
  return getGroupScore(groupId);
}
