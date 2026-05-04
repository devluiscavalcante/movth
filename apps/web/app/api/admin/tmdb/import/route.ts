import { NextResponse } from "next/server";
import { serverApi } from "../../../../lib/session";

export async function POST(request: Request) {
  const payload = await request.json();
  const result = await serverApi("/admin/tmdb/import", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return NextResponse.json(result.body, { status: result.status });
}
