"use server";
import jwt from "jsonwebtoken";

// Just generate any old token the browser wants, for now
export async function generateToken({ scope }: { scope: string }) {
  if (scope === "cyberdeck") {
    throw new Error("Cannot generate cyberdeck token from browser");
  }
  const wsToken = jwt.sign({ scope }, process.env.JWT_SECRET!);
  return wsToken;
}
