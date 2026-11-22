"use server";

import { getMealData } from "@/lib/lausd";

export async function fetchMealData({
  schoolSlug,
  schoolId,
  meal,
}: {
  schoolSlug: string;
  schoolId: string;
  meal: string;
}) {
  return getMealData({
    sid: schoolId,
    sg: schoolSlug,
    mg: meal,
  });
}
