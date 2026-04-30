import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TRANSCODE_QUEUE_NAME: z.string().default("transcode"),
  FFMPEG_THREADS: z.coerce.number().int().positive().default(2)
});

export const env = envSchema.parse(process.env);
