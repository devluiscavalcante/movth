import { NextResponse } from "next/server";
import { serverApi } from "../../../lib/session";

type RouteContext = {
  params: {
    titleId: string;
  };
};

export async function DELETE(request: Request, { params }: RouteContext) {
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  const query = profileId ? `?profileId=${profileId}` : "";
  const result = await serverApi(`/watchlist/${params.titleId}${query}`, {
    method: "DELETE"
  });

  if (result.status === 204) {
    return new Response(null, { status: 204 });
  }

  return NextResponse.json(result.body, { status: result.status });
}
