import { NextResponse } from "next/server";
import { serverApi } from "../../../../lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await serverApi(`/admin/tmdb/search${url.search}`);

  return NextResponse.json(result.body, { status: result.status });
}
