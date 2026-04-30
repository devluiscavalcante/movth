import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PROFILE_COOKIE, cookieOptions } from "../../../lib/session";

export async function POST(request: Request) {
  const body = (await request.json()) as { profileId?: string };

  if (!body.profileId) {
    return NextResponse.json(
      {
        error: {
          code: "PROFILE_REQUIRED",
          message: "Profile is required"
        }
      },
      { status: 400 }
    );
  }

  cookies().set(PROFILE_COOKIE, body.profileId, cookieOptions(30 * 24 * 60 * 60));

  return NextResponse.json({
    data: {
      profileId: body.profileId
    }
  });
}
