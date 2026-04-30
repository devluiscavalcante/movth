import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, SubscriptionStatus } from "@movth/db";
import { forbidden, unauthorized } from "../lib/api-error.js";

const activeStatuses = new Set<SubscriptionStatus>([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING
]);

export async function requireActivePlan(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.authUser) {
    throw unauthorized();
  }

  const user = await prisma.user.findUnique({
    where: { id: request.authUser.userId },
    include: {
      subscriptions: {
        orderBy: { currentPeriodEnd: "desc" },
        take: 1
      }
    }
  });

  if (!user) {
    throw unauthorized("USER_NOT_FOUND", "Authenticated user no longer exists");
  }

  const subscription = user.subscriptions[0];
  const trialActive = user.trialEndsAt ? user.trialEndsAt.getTime() > Date.now() : false;
  const subscriptionActive =
    subscription &&
    activeStatuses.has(subscription.status) &&
    subscription.currentPeriodEnd.getTime() > Date.now();

  if (!user.planId || (!trialActive && !subscriptionActive)) {
    throw forbidden("ACTIVE_PLAN_REQUIRED", "An active plan is required");
  }
}
