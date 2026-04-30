import { Queue } from "bullmq";
import type { TranscodeJobPayload } from "@movth/types";
import { env } from "../config/env.js";
import { redis } from "./redis.js";

export const transcodeQueue = new Queue<TranscodeJobPayload>(env.TRANSCODE_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 10_000
    },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});
