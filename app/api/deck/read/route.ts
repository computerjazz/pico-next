import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { deckMessages } from "@/db/schema";
import { validateDeckToken, verifyAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const maybeResponse = await verifyAuth(req, {
    tag: "deck-inbox-read",
    validateToken: validateDeckToken,
  });

  if (maybeResponse) {
    return maybeResponse;
  }

  const p = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(p?.ids)
    ? p.ids.filter((n: unknown) => Number.isInteger(n)).slice(0, 50)
    : [];
  if (ids.length === 0)
    return NextResponse.json({ error: "invalid" }, { status: 400 });

  await db
    .update(deckMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        inArray(deckMessages.id, ids),
        eq(deckMessages.direction, "in"),
        isNull(deckMessages.readAt),
      ),
    );

  return NextResponse.json({ ok: true });
}
