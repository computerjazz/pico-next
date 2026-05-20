// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

export async function POST(req: NextRequest) {
  const subscription = await req.json();
  console.log("subscription", subscription);

  const { endpoint, keys } = subscription;
  const { p256dh, auth } = keys;

  await db
    .insert(pushSubscriptions)
    .values({ endpoint, p256dh, auth })
    .onConflictDoNothing(); // endpoint is unique, so just ignore duplicates

  return NextResponse.json({ ok: true });
}
