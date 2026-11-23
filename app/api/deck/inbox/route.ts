import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { deckContacts, deckMessages } from "@/db/schema";
import { validateDeckToken, verifyAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const maybeResponse = await verifyAuth(req, {
    tag: "deck-inbox",
    validateToken: validateDeckToken,
  });

  if (maybeResponse) {
    return maybeResponse;
  }

  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;

  const rows = await db
    .select({
      id: deckMessages.id,
      from: deckContacts.displayName,
      subject: deckMessages.subject,
      body: deckMessages.body,
      createdAt: deckMessages.createdAt,
    })
    .from(deckMessages)
    .innerJoin(deckContacts, eq(deckMessages.contactId, deckContacts.id))
    .where(and(eq(deckMessages.direction, "in"), gt(deckMessages.id, after)))
    .orderBy(asc(deckMessages.id))
    .limit(20);

  return NextResponse.json({ messages: rows });
}
