import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const ref = new URL(request.url).searchParams.get("ref");

  // Set affiliate cookie on first click only (don't overwrite existing attribution)
  if (ref && !request.cookies.get("affiliate_ref")) {
    response.cookies.set("affiliate_ref", ref, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
