import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32).optional(),
  PASSWORD_PEPPER: z.string().min(32).optional(),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30)
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  JWT_SECRET:
    parsedEnv.JWT_SECRET ??
    "movth-development-jwt-secret-change-before-production"
};
