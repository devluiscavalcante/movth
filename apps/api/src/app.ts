import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { prisma } from "@movth/db";
import { env } from "./config/env.js";
import { ApiError } from "./lib/api-error.js";
import { adminCatalogRoutes } from "./routes/admin-catalog.js";
import { adminUploadRoutes } from "./routes/admin-upload.js";
import { authRoutes } from "./routes/auth.js";
import { catalogRoutes } from "./routes/catalog.js";
import { profileRoutes } from "./routes/profiles.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug"
    }
  });

  app.register(helmet);
  app.register(cors, {
    origin: true,
    credentials: true
  });
  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute"
  });
  app.register(jwt, {
    secret: env.JWT_SECRET
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
          issues: error.issues
        }
      });
    }

    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    const httpError = error as {
      statusCode?: number;
      code?: string;
      message?: string;
    };

    if (
      httpError.statusCode &&
      httpError.statusCode >= 400 &&
      httpError.statusCode < 500
    ) {
      return reply.code(httpError.statusCode).send({
        error: {
          code: httpError.code ?? "BAD_REQUEST",
          message: httpError.message ?? "Bad request"
        }
      });
    }

    request.log.error(error);

    return reply.code(500).send({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error"
      }
    });
  });

  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      service: "movth-api"
    };
  });

  app.register(authRoutes, { prefix: "/auth" });
  app.register(profileRoutes, { prefix: "/profiles" });
  app.register(catalogRoutes);
  app.register(adminCatalogRoutes, { prefix: "/admin" });
  app.register(adminUploadRoutes, { prefix: "/admin" });

  return app;
}
