import { NextResponse } from "next/server";
import { serverApi } from "../../../../../lib/session";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  const payload = await request.json();
  const result = await serverApi(`/admin/titles/${context.params.id}/episodes`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return NextResponse.json(result.body, { status: result.status });
}
