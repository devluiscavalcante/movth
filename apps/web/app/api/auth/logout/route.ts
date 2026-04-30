import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  PROFILE_COOKIE,
  REFRESH_TOKEN_COOKIE,
  apiBaseUrl
} from "../../../lib/session";

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

  cookies().delete(ACCESS_TOKEN_COOKIE);
  cookies().delete(REFRESH_TOKEN_COOKIE);
  cookies().delete(PROFILE_COOKIE);

  return NextResponse.json({ data: { ok: true } });
}
