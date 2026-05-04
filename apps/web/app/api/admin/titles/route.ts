import { NextResponse } from "next/server";
import { serverApi } from "../../../lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await serverApi(`/admin/titles${url.search}`);

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const result = await serverApi("/admin/titles", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return NextResponse.json(result.body, { status: result.status });
}
