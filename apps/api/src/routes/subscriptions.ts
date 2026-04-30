import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, SubscriptionStatus } from "@movth/db";
import { env } from "../config/env.js";
import { badRequest, notFound, unauthorized } from "../lib/api-error.js";
import { sendData, sendNoContent } from "../lib/reply.js";
import { stripe } from "../lib/stripe.js";
import { requireAuth } from "../middleware/require-auth.js";

const checkoutSchema = z.object({
  planId: z.string().uuid()
});

function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "incomplete":
      return SubscriptionStatus.INCOMPLETE;
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
      return SubscriptionStatus.CANCELED;
    case "unpaid":
      return SubscriptionStatus.UNPAID;
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}

function requireUserId(request: { authUser?: { userId: string } }) {
  if (!request.authUser) {
    throw unauthorized();
  }

  return request.authUser.userId;
}

async function getOrCreateStripeCustomer(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw unauthorized("USER_NOT_FOUND", "Authenticated user no longer exists");
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: {
      userId: user.id
    }
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id }
  });

  return customer.id;
}

async function syncSubscription(subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subscriptionPeriodEnd = (subscription as unknown as { current_period_end?: number })
    .current_period_end;

  if (!subscriptionPeriodEnd) {
    throw new Error(`Stripe subscription missing current_period_end: ${subscription.id}`);
  }

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId }
  });

  if (!user) {
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId
    ? await prisma.plan.findUnique({
        where: { stripePriceId: priceId }
      })
    : null;
  const status = mapStripeStatus(subscription.status);
  const currentPeriodEnd = new Date(subscriptionPeriodEnd * 1000);
  const planId = plan?.id ?? null;

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { stripeSubId: subscription.id },
      update: {
        userId: user.id,
        planId,
        stripeCustomerId: customerId,
        status,
        currentPeriodEnd
      },
      create: {
        userId: user.id,
        planId,
        stripeCustomerId: customerId,
        stripeSubId: subscription.id,
        status,
        currentPeriodEnd
      }
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        planId:
          status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING
            ? plan?.id ?? user.planId
            : user.planId
      }
    })
  ]);
}

export async function subscriptionRoutes(app: FastifyInstance) {
  app.post("/checkout", { preHandler: requireAuth }, async (request, reply) => {
    const userId = requireUserId(request);
    const body = checkoutSchema.parse(request.body);
    const plan = await prisma.plan.findUnique({
      where: { id: body.planId }
    });

    if (!plan) {
      throw notFound("PLAN_NOT_FOUND", "Plan not found");
    }

    if (!plan.stripePriceId) {
      throw badRequest("PLAN_NOT_CONFIGURED", "Plan does not have a Stripe price configured");
    }

    const customerId = await getOrCreateStripeCustomer(userId);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1
        }
      ],
      success_url: `${env.WEB_URL}/account?checkout=success`,
      cancel_url: `${env.WEB_URL}/account?checkout=cancelled`,
      metadata: {
        userId,
        planId: plan.id
      },
      subscription_data: {
        metadata: {
          userId,
          planId: plan.id
        }
      }
    });

    return sendData(reply, {
      url: session.url
    });
  });

  app.post("/portal", { preHandler: requireAuth }, async (request, reply) => {
    const userId = requireUserId(request);
    const customerId = await getOrCreateStripeCustomer(userId);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.WEB_URL}/account`
    });

    return sendData(reply, {
      url: session.url
    });
  });

  app.post("/webhook", async (request, reply) => {
    const signature = request.headers["stripe-signature"];

    if (!signature || Array.isArray(signature)) {
      throw badRequest("MISSING_STRIPE_SIGNATURE", "Missing Stripe signature");
    }

    const rawBody = request.rawBody;

    if (!rawBody) {
      throw badRequest("MISSING_RAW_BODY", "Missing raw webhook body");
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (subscriptionId) {
          await syncSubscription(subscriptionId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object.id);
        break;
      }
      default:
        request.log.debug({ stripeEventType: event.type }, "Ignored Stripe event");
    }

    return sendNoContent(reply);
  });
}
