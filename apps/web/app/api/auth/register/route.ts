import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl, cookieOptions } from "../../../lib/session";

type RegisterResponse = {
  data?: {
    user: unknown;
    accessToken: string;
    refreshToken: string;
  };
  error?: unknown;
};

export async function POST(request: Request) {
  const payload = await request.json();
  const response = await fetch(`${apiBaseUrl()}/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const body = (await response.json()) as RegisterResponse;

  if (!response.ok || !body.data) {
    return NextResponse.json(body, { status: response.status });
  }

  cookies().set("movth_access_token", body.data.accessToken, cookieOptions(15 * 60));
  cookies().set("movth_refresh_token", body.data.refreshToken, cookieOptions(30 * 24 * 60 * 60));

  return NextResponse.json({
    data: {
      user: body.data.user
    }
  });
}
