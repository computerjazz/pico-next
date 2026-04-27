import { db } from "@/db";
import { devices, toggleState } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import z from "zod";

export async function GET(req: Request) {
  try {
    const maybeErr = await verifyAuth(req, { method: "GET", tag: "toggle" });
    if (maybeErr) return maybeErr;
    const device = await db.query.toggleState.findFirst();
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

const ToggleStatePostBodySchema = z.object({
  state: z.string(),
});

type ToggleStatePostBody = z.infer<typeof ToggleStatePostBodySchema>;

export async function POST(req: Request) {
  const maybeErr = await verifyAuth(req, { method: "POST", tag: "toggle" });
  if (maybeErr) return maybeErr;

  const reqJson = await req.json();
  const parsed = ToggleStatePostBodySchema.safeParse(reqJson);
  if (!parsed.success) {
    console.log("bad toggle state request!");
    return Response.json({ error: "malformed body" }, { status: 400 });
  }

  const { state } = parsed.data;

  const deviceId = req.headers.get("x-device-id") ?? "";
  await db
    .insert(devices)
    .values({
      deviceId,
      type: "toggle",
    })
    .onConflictDoNothing();

  await db
    .update(toggleState)
    .set({
      state,
    })
    .where(eq(toggleState.deviceId, deviceId));
}
