import { NextResponse } from "next/server";

import { auth } from "@/auth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/salary",
  "/income",
  "/expenses",
  "/investments",
  "/settings",
];

export default auth((req) => {
  const { nextUrl } = req;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    nextUrl.pathname.startsWith(prefix)
  );

  if (isProtected && !req.auth) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/salary/:path*",
    "/income/:path*",
    "/expenses/:path*",
    "/investments/:path*",
    "/settings/:path*",
  ],
};
