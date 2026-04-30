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
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().default("movth-dev-media"),
  CLOUDFRONT_DOMAIN: z.string().url().default("https://cdn.example.com"),
  TRANSCODE_QUEUE_NAME: z.string().default("transcode"),
  STRIPE_SECRET_KEY: z.string().default("sk_test_replace_me"),
  STRIPE_WEBHOOK_SECRET: z.string().default("whsec_replace_me"),
  WEB_URL: z.string().url().default("http://localhost:3000")
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  JWT_SECRET:
    parsedEnv.JWT_SECRET ??
    "movth-development-jwt-secret-change-before-production"
};
