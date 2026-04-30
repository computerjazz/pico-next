"use server";
import { getGroupScore } from "@/lib/toggle-score";

export async function fetchGroupScoreAction(groupId: string) {
  return getGroupScore(groupId);
}
