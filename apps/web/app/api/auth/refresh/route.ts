import { NextResponse } from "next/server";
import { REFRESH_TOKEN_COOKIE, apiBaseUrl, clearAuthCookies, setAuthCookies } from "../../../lib/session";
import { cookies } from "next/headers";

type RefreshResponse = {
  data?: {
    user: unknown;
    accessToken: string;
    refreshToken: string;
  };
  error?: unknown;
};

export async function POST() {
  const refreshToken = cookies().get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    clearAuthCookies();
    return NextResponse.json(
      {
        error: {
          code: "REFRESH_TOKEN_REQUIRED",
          message: "Refresh token required"
        }
      },
      { status: 401 }
    );
  }

  const response = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store"
  });
  const body = (await response.json().catch(() => ({}))) as RefreshResponse;

  if (!response.ok || !body.data) {
    clearAuthCookies();
    return NextResponse.json(body, { status: response.status });
  }

  setAuthCookies(body.data);

  return NextResponse.json({
    data: {
      user: body.data.user
    }
  });
}
