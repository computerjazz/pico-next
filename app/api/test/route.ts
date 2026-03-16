import { db } from "@/db";
import { users } from "@/db/schema";

export async function GET() {
  const result = await db.select().from(users);
  return Response.json(result);
}
