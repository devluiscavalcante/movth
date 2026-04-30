import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, UserRole } from "@movth/db";
import { forbidden, unauthorized } from "../lib/api-error.js";

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.authUser) {
    throw unauthorized();
  }

  const user = await prisma.user.findUnique({
    where: { id: request.authUser.userId },
    select: { role: true }
  });

  if (!user || user.role !== UserRole.ADMIN) {
    throw forbidden("ADMIN_REQUIRED", "Admin access is required");
  }
}
