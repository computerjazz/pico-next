import { verifyAuth } from "@/lib/auth";
import { fetchMenuHtml, parseMenus, todayInLA } from "@/lib/lausd";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const authError = await verifyAuth(req, { tag: "lausd lunch" });

    if (authError) return authError;

    const html = await fetchMenuHtml({
      sid: searchParams.get("sid") ?? "",
      sg: searchParams.get("sg") ?? "",
      mg: searchParams.get("mg") ?? "BF",
      date: searchParams.get("date") ?? todayInLA(),
      calendar: "weekly",
    });
    return NextResponse.json({ menus: parseMenus(html) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 502 },
    );
  }
}
