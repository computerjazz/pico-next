import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  console.log("req.url", req.url, req.auth);
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: [
    /*
      Match all request paths except for:
      - static files (_next, favicon, etc.)
      - API routes (/api)
      - login page (/login)
    */
    "/device/:id*",
  ],
};
