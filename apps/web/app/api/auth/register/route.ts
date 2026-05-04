import { NextResponse } from "next/server";
import { apiBaseUrl, setAuthCookies } from "../../../lib/session";

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

  setAuthCookies(body.data);

  return NextResponse.json({
    data: {
      user: body.data.user
    }
  });
}
