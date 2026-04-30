import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@movth/db";
import { env } from "./config/env.js";

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const worker = new Worker(
  env.TRANSCODE_QUEUE_NAME,
  async (job) => {
    const { videoAssetId } = job.data as { videoAssetId: string };

    await prisma.videoAsset.update({
      where: { id: videoAssetId },
      data: { status: "PROCESSING" }
    });

    // FFmpeg orchestration will be implemented in the transcoding phase.
    await prisma.videoAsset.update({
      where: { id: videoAssetId },
      data: { status: "READY" }
    });

    return { videoAssetId };
  },
  { connection }
);

worker.on("completed", (job) => {
  console.info(`Transcode job completed: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Transcode job failed: ${job?.id}`, error);
});
