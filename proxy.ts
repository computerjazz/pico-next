import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoginRoute = req.nextUrl.pathname.startsWith("/login");
  if (req.auth) {
    if (isLoginRoute) {
      const redirectTarget = req.nextUrl.searchParams.get("redirect");
      if (redirectTarget) {
        // If user is authenticated and on /login?redirect=... , redirect to specified location
        console.log("redirect to ", redirectTarget, req.url);
        return NextResponse.redirect(new URL(redirectTarget, req.url));
      } else {
        // redirect home
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
  } else {
    if (!isLoginRoute) {
      const loginUrl = new URL("/login", req.url);
      if (!loginUrl.searchParams.has("redirect")) {
        // Preserve the full path and query string
        loginUrl.searchParams.set(
          "redirect",
          req.nextUrl.pathname + req.nextUrl.search,
        );
        return NextResponse.redirect(loginUrl);
      }
    }
  }
});

export const config = {
  matcher: ["/device/:id*", "/login"],
};
