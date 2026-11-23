import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, count } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/db";
import { deckContacts, deckMessages } from "@/db/schema";
import { validateDeckToken, verifyAuth } from "@/lib/auth";

let _resend: Resend | null = null;

function getResend() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not set");
  }
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const MAX_BODY = 5000;
const MAX_PER_HOUR = 20;

export async function POST(req: NextRequest) {
  const maybeResponse = await verifyAuth(req, {
    tag: "deck-send",
    method: "POST",
    validateToken: validateDeckToken,
  });

  if (maybeResponse) {
    return maybeResponse;
  }

  const p = await req.json().catch(() => null);
  const to = typeof p?.to === "string" ? p.to : "";
  const body = typeof p?.body === "string" ? p.body.trim() : "";
  if (!to || !body || body.length > MAX_BODY) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const [contact] = await db
    .select()
    .from(deckContacts)
    .where(and(eq(deckContacts.key, to), eq(deckContacts.canSendTo, true)));
  if (!contact) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Rate limit: outbound messages in the last hour
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(deckMessages)
    .where(
      and(eq(deckMessages.direction, "out"), gt(deckMessages.createdAt, since)),
    );
  if (n >= MAX_PER_HOUR) {
    return NextResponse.json({ error: "slow down" }, { status: 429 });
  }

  const senderName = process.env.DECK_SENDER_NAME ?? "Cyberdeck";
  const subject =
    String(p.subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 120) || `Message from ${senderName}`;

  const { error } = await getResend().emails.send({
    from: `${senderName} <${process.env.DECK_FROM_ADDRESS}>`,
    to: contact.email,
    replyTo: process.env.DECK_FROM_ADDRESS, // replies from approved senders come back to the deck
    subject,
    text: body, // plain text only, no HTML
  });

  await db.insert(deckMessages).values({
    direction: "out",
    contactId: contact.id,
    subject,
    body,
    status: error ? "failed" : "sent",
  });

  if (error)
    return NextResponse.json({ error: "send failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
