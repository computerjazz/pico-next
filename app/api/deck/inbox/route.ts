import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
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

  const rows = await db
    .select({
      id: deckMessages.id,
      key: deckContacts.key,
      from: deckContacts.displayName,
      subject: deckMessages.subject,
      body: deckMessages.body,
      createdAt: deckMessages.createdAt,
      readAt: deckMessages.readAt,
    })
    .from(deckMessages)
    .innerJoin(deckContacts, eq(deckMessages.contactId, deckContacts.id))
    .where(eq(deckMessages.direction, "in"))
    .orderBy(desc(deckMessages.id))
    .limit(50);

  return NextResponse.json({ messages: rows.reverse() }); // oldest first
}
