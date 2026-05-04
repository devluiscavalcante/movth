import { NextResponse } from "next/server";
import { serverApi } from "../../../../lib/session";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const result = await serverApi(`/admin/titles/${context.params.id}`);

  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(request: Request, context: RouteContext) {
  const payload = await request.json();
  const result = await serverApi(`/admin/titles/${context.params.id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const result = await serverApi(`/admin/titles/${context.params.id}`, {
    method: "DELETE"
  });

  if (result.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(result.body, { status: result.status });
}
