import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoginRoute = req.nextUrl.pathname.startsWith("/login");
  if (req.auth) {
    if (isLoginRoute) {
      if (req.nextUrl.searchParams.has("redirect")) {
        // If user is authenticated and on /login?redirect=... , redirect to specified location
        const redirectTarget = req.nextUrl.searchParams.get("redirect")!;
        return NextResponse.redirect(new URL(redirectTarget, req.url));
      } else {
        // redirect home
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
  } else {
    const loginUrl = new URL("/login", req.url);
    if (!loginUrl.searchParams.has("redirect") && !isLoginRoute) {
      // Preserve the full path and query string
      loginUrl.searchParams.set(
        "redirect",
        req.nextUrl.pathname + req.nextUrl.search,
      );
      return NextResponse.redirect(loginUrl);
    }
  }
});

export const config = {
  matcher: [
    /*
      Match all request paths except for:
      - static files (_next, favicon, etc.)
      - API routes (/api)
    */
    "/device/:id*",
    "/login",
  ],
};
