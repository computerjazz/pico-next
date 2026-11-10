import { verifyAuth } from "@/lib/auth";
import { getMealData } from "@/lib/lausd";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const authError = await verifyAuth(req, { tag: "lausd lunch" });
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const { menus } = await getMealData({
      sid: searchParams.get("schoolId") ?? "",
      sg: searchParams.get("schoolSlug") ?? "",
      mg: searchParams.get("meal") ?? "BF",
    });
    return NextResponse.json({ menus });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 502 },
    );
  }
}
