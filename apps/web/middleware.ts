import { NextRequest, NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE = "movth_access_token";
const REFRESH_TOKEN_COOKIE = "movth_refresh_token";

function apiBaseUrl() {
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

function requestWithCookies(request: NextRequest, cookies: Record<string, string>) {
  const requestHeaders = new Headers(request.headers);
  const currentCookies = requestHeaders.get("cookie") ?? "";
  const nextCookies = [
    ...currentCookies
      .split(";")
      .map((item) => item.trim())
      .filter(
        (item) =>
          item &&
          !item.startsWith(`${ACCESS_TOKEN_COOKIE}=`) &&
          !item.startsWith(`${REFRESH_TOKEN_COOKIE}=`)
      ),
    ...Object.entries(cookies).map(([name, value]) => `${name}=${value}`)
  ];

  requestHeaders.set("cookie", nextCookies.join("; "));

  return requestHeaders;
}

function secondsUntilExpiry(token: string) {
  const payload = token.split(".")[1];

  if (!payload) {
    return 0;
  }

  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };

    if (!decoded.exp) {
      return 0;
    }

    return decoded.exp - Math.floor(Date.now() / 1000);
  } catch {
    return 0;
  }
}

async function refreshTokens(refreshToken: string) {
  const response = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    data?: {
      accessToken: string;
      refreshToken: string;
    };
  } | null;

  return body?.data ?? null;
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.next();
  }

  if (accessToken && secondsUntilExpiry(accessToken) > 60) {
    return NextResponse.next();
  }

  const tokens = await refreshTokens(refreshToken);

  if (!tokens) {
    const response = NextResponse.next();
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestWithCookies(request, {
        [ACCESS_TOKEN_COOKIE]: tokens.accessToken,
        [REFRESH_TOKEN_COOKIE]: tokens.refreshToken
      })
    }
  });

  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions(15 * 60));
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions(30 * 24 * 60 * 60));

  return response;
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
