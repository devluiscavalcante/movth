import { NextResponse } from "next/server";
import { serverApi } from "../../../lib/session";

type PortalResponse = {
  url: string;
};

export async function POST() {
  const result = await serverApi<PortalResponse>("/subscription/portal", {
    method: "POST"
  });

  return NextResponse.json(result.body, { status: result.status });
}
