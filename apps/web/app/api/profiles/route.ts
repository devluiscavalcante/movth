import { NextResponse } from "next/server";
import type { ApiEnvelope, Profile } from "../../lib/session";
import { serverApi } from "../../lib/session";

export async function GET() {
  const result = await serverApi<Profile[]>("/profiles");
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const result = await serverApi<Profile[]>("/profiles", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return NextResponse.json(result.body satisfies ApiEnvelope<Profile[]>, {
    status: result.status
  });
}
