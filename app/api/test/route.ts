import { db } from "@/db";
import { users } from "@/db/schema";

export async function GET() {
  try {
    // Fetch first 10 users
    const result = await db.select().from(users).limit(10);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("DB query failed:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
