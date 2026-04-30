import type { FastifyInstance } from "fastify";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { prisma, TitleStatus, TitleType, VideoAssetStatus, VideoQuality } from "@movth/db";
import type { TranscodeJobPayload } from "@movth/types";
import { env } from "../config/env.js";
import { badRequest, notFound } from "../lib/api-error.js";
import { sendData } from "../lib/reply.js";
import { s3 } from "../lib/s3.js";
import { transcodeQueue } from "../lib/transcode-queue.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { requireAuth } from "../middleware/require-auth.js";

const titleParamsSchema = z.object({
  id: z.string().uuid()
});

const uploadRequestSchema = z.object({
  episodeId: z.string().uuid().optional(),
  contentType: z.string().default("video/mp4"),
  fileName: z.string().trim().min(1).default("original.mp4")
});

const uploadCompleteSchema = z.object({
  episodeId: z.string().uuid().optional(),
  s3Key: z.string().trim().min(1)
});

function rawKey(titleId: string, episodeId?: string) {
  return episodeId
    ? `raw/${titleId}/episodes/${episodeId}/original.mp4`
    : `raw/${titleId}/original.mp4`;
}

function titlePlaybackType(titleType: TitleType, episodeId?: string): TranscodeJobPayload["type"] {
  if (episodeId) {
    return "episode";
  }

  if (titleType === TitleType.SERIES) {
    throw badRequest("EPISODE_REQUIRED", "Series uploads require an episodeId");
  }

  return "movie";
}

async function assertUploadTarget(titleId: string, episodeId?: string) {
  const title = await prisma.title.findUnique({
    where: { id: titleId }
  });

  if (!title) {
    throw notFound("TITLE_NOT_FOUND", "Title not found");
  }

  if (episodeId) {
    const episode = await prisma.episode.findFirst({
      where: {
        id: episodeId,
        titleId
      }
    });

    if (!episode) {
      throw notFound("EPISODE_NOT_FOUND", "Episode not found for this title");
    }
  }

  const type = titlePlaybackType(title.type, episodeId);

  return { title, type };
}

export async function adminUploadRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireAdmin);

  app.post("/titles/:id/upload", async (request, reply) => {
    const params = titleParamsSchema.parse(request.params);
    const body = uploadRequestSchema.parse(request.body ?? {});
    await assertUploadTarget(params.id, body.episodeId);

    const s3Key = rawKey(params.id, body.episodeId);
    const command = new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: s3Key,
      ContentType: body.contentType,
      Metadata: {
        originalFileName: body.fileName
      }
    });
    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: 15 * 60
    });

    return sendData(reply, {
      uploadUrl,
      method: "PUT",
      bucket: env.AWS_S3_BUCKET,
      s3Key,
      expiresIn: 15 * 60
    });
  });

  app.post("/titles/:id/upload/complete", async (request, reply) => {
    const params = titleParamsSchema.parse(request.params);
    const body = uploadCompleteSchema.parse(request.body);
    const { type } = await assertUploadTarget(params.id, body.episodeId);

    await prisma.title.update({
      where: { id: params.id },
      data: { status: TitleStatus.PROCESSING }
    });

    const existingAsset = await prisma.videoAsset.findFirst({
      where: {
        titleId: params.id,
        episodeId: body.episodeId ?? null,
        quality: VideoQuality.HD
      }
    });

    if (existingAsset) {
      await prisma.videoAsset.update({
        where: { id: existingAsset.id },
        data: {
          hlsManifestUrl: "",
          thumbnailUrl: null,
          status: VideoAssetStatus.PENDING
        }
      });
    } else {
      await prisma.videoAsset.create({
        data: {
          titleId: params.id,
          ...(body.episodeId ? { episodeId: body.episodeId } : {}),
          quality: VideoQuality.HD,
          hlsManifestUrl: "",
          status: VideoAssetStatus.PENDING
        }
      });
    }

    const payload: TranscodeJobPayload = {
      titleId: params.id,
      ...(body.episodeId ? { episodeId: body.episodeId } : {}),
      s3Key: body.s3Key,
      type
    };
    const job = await transcodeQueue.add("transcode-video", payload, {
      jobId: body.episodeId ? `${params.id}:${body.episodeId}` : params.id
    });

    return sendData(reply, {
      jobId: job.id,
      status: "queued",
      payload
    });
  });
}
