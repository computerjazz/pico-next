"use server";

import jwt from "jsonwebtoken";

// Just generate any old token the browser wants, for now
export function generateToken({ scope }: { scope: string }) {
  const wsToken = jwt.sign({ scope }, process.env.JWT_SECRET!);
  return wsToken;
}
