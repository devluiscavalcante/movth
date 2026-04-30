import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prisma, TitleStatus, VideoAssetStatus } from "@movth/db";
import type { TranscodeJobPayload } from "@movth/types";
import { env } from "./config/env.js";
import { extractThumbnail, renditions, transcodeHls } from "./lib/ffmpeg.js";
import { downloadS3Object, uploadDirectoryToS3 } from "./lib/storage.js";

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

function processedPrefix(payload: TranscodeJobPayload) {
  return payload.episodeId
    ? `processed/${payload.titleId}/episodes/${payload.episodeId}`
    : `processed/${payload.titleId}`;
}

function cloudFrontUrl(key: string) {
  return `${env.CLOUDFRONT_DOMAIN.replace(/\/$/, "")}/${key}`;
}

async function markFailed(payload: TranscodeJobPayload) {
  await prisma.videoAsset.updateMany({
    where: {
      titleId: payload.titleId,
      episodeId: payload.episodeId ?? null
    },
    data: {
      status: VideoAssetStatus.FAILED
    }
  });
  await prisma.title.update({
    where: { id: payload.titleId },
    data: { status: TitleStatus.DRAFT }
  });
}

const worker = new Worker(
  env.TRANSCODE_QUEUE_NAME,
  async (job) => {
    const payload = job.data as TranscodeJobPayload;
    const workBase = env.TRANSCODE_WORKDIR || join(tmpdir(), "movth-transcode");
    await mkdir(workBase, { recursive: true });
    const workRoot = await mkdtemp(join(workBase, "job-"));
    const inputPath = join(workRoot, "original.mp4");
    const outputDirectory = join(workRoot, "hls");
    const thumbnailPath = join(outputDirectory, "thumbnail.jpg");
    const outputPrefix = processedPrefix(payload);

    await mkdir(outputDirectory, { recursive: true });

    try {
      await prisma.title.update({
        where: { id: payload.titleId },
        data: { status: TitleStatus.PROCESSING }
      });
      await prisma.videoAsset.updateMany({
        where: {
          titleId: payload.titleId,
          episodeId: payload.episodeId ?? null
        },
        data: { status: VideoAssetStatus.PROCESSING }
      });

      await downloadS3Object(payload.s3Key, inputPath);
      await transcodeHls(inputPath, outputDirectory);
      await extractThumbnail(inputPath, thumbnailPath);
      await uploadDirectoryToS3(outputDirectory, outputPrefix);

      for (const rendition of renditions) {
        const existingAsset = await prisma.videoAsset.findFirst({
          where: {
            titleId: payload.titleId,
            episodeId: payload.episodeId ?? null,
            quality: rendition.quality
          }
        });
        const assetData = {
          hlsManifestUrl: cloudFrontUrl(`${outputPrefix}/${rendition.label}/index.m3u8`),
          thumbnailUrl: cloudFrontUrl(`${outputPrefix}/thumbnail.jpg`),
          status: VideoAssetStatus.READY
        };

        if (existingAsset) {
          await prisma.videoAsset.update({
            where: { id: existingAsset.id },
            data: assetData
          });
        } else {
          await prisma.videoAsset.create({
            data: {
              titleId: payload.titleId,
              ...(payload.episodeId ? { episodeId: payload.episodeId } : {}),
              quality: rendition.quality,
              ...assetData
            }
          });
        }
      }

      await prisma.title.update({
        where: { id: payload.titleId },
        data: { status: TitleStatus.READY }
      });

      return {
        titleId: payload.titleId,
        episodeId: payload.episodeId,
        masterManifestUrl: cloudFrontUrl(`${outputPrefix}/master.m3u8`),
        thumbnailUrl: cloudFrontUrl(`${outputPrefix}/thumbnail.jpg`)
      };
    } catch (error) {
      await markFailed(payload);
      throw error;
    } finally {
      await rm(workRoot, { recursive: true, force: true });
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.info(`Transcode job completed: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Transcode job failed: ${job?.id}`, error);
});
