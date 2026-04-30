import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TRANSCODE_QUEUE_NAME: z.string().default("transcode"),
  FFMPEG_THREADS: z.coerce.number().int().positive().default(2),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().default("movth-dev-media"),
  CLOUDFRONT_DOMAIN: z.string().url().default("https://cdn.example.com"),
  TRANSCODE_WORKDIR: z.string().default("/tmp/movth-transcode")
});

export const env = envSchema.parse(process.env);
