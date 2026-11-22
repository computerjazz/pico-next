import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deckContacts, deckMessages } from "@/db/schema";

function secretOk(header: string | null) {
  const expected = process.env.DECK_INBOUND_SECRET ?? "";
  if (!header || !expected) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Fails closed. Adjust after you've seen a real authResults string.
function senderAuthenticated(authResults: string | null, fromAddr: string) {
  if (!authResults) return false;
  const domain = fromAddr.split("@")[1] ?? "";
  const r = authResults.toLowerCase();
  const dmarcPass = /dmarc=pass/.test(r);
  const dkimAligned =
    r.includes("dkim=pass") && r.includes(`header.d=${domain}`);
  return dmarcPass || dkimAligned;
}

function stripQuoted(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  const cut = lines.findIndex(
    (l) => l.startsWith(">") || /^On .+wrote:$/.test(l.trim()),
  );
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
}

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-deck-secret"))) {
    return new NextResponse(null, { status: 401 });
  }

  const p = await req.json().catch(() => null);
  if (!p) return NextResponse.json({ ok: false }, { status: 400 });

  const from = String(p.headerFrom ?? p.from ?? "").toLowerCase();
  console.log("deck inbound", {
    from,
    authResults: p.authResults,
    spf: p.receivedSpf,
  }); // remove once tuned

  const [contact] = await db
    .select()
    .from(deckContacts)
    .where(
      and(eq(deckContacts.email, from), eq(deckContacts.canReceiveFrom, true)),
    );

  // Unknown sender or failed auth: drop quietly
  if (!contact || !senderAuthenticated(p.authResults ?? null, from)) {
    return NextResponse.json({ ok: true });
  }

  const body = stripQuoted(String(p.text ?? "")).slice(0, 1000);

  const subject = String(p.subject ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 120);

  if (!body && !subject) return NextResponse.json({ ok: true });

  await db.insert(deckMessages).values({
    direction: "in",
    contactId: contact.id,
    body,
    subject,
  });

  return NextResponse.json({ ok: true });
}
