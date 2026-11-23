import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deckContacts } from "@/db/schema";
import { validateDeckToken, verifyAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const maybeResponse = await verifyAuth(req, {
    tag: "deck-contacts",
    validateToken: validateDeckToken,
  });

  if (maybeResponse) {
    return maybeResponse;
  }

  const rows = await db
    .select({ key: deckContacts.key, name: deckContacts.displayName })
    .from(deckContacts)
    .where(eq(deckContacts.canSendTo, true));

  return NextResponse.json({ contacts: rows });
}
