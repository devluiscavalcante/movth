import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthorized } from "../lib/api-error.js";
import type { AccessTokenPayload } from "../lib/tokens.js";

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const payload = await request.jwtVerify<AccessTokenPayload>();
    request.authUser = {
      userId: payload.sub,
      email: payload.email
    };
  } catch {
    throw unauthorized("INVALID_TOKEN", "Invalid or expired access token");
  }
}
