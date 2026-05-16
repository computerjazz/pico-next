"use server";
import { cookies } from "next/headers";

export async function setTheme(theme: "light" | "dark" | "system") {
  (await cookies()).set("theme", theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
