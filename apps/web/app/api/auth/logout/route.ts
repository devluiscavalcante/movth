import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { REFRESH_TOKEN_COOKIE, apiBaseUrl, clearAuthCookies } from "../../../lib/session";

export async function POST() {
  const refreshToken = cookies().get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store"
    }).catch(() => undefined);
  }

  clearAuthCookies();

  return NextResponse.json({ data: { ok: true } });
}
