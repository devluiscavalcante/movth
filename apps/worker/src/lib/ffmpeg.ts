import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { VideoQuality } from "@movth/db";
import { env } from "../config/env.js";

export type Rendition = {
  label: "360p" | "720p" | "1080p" | "4k";
  quality: VideoQuality;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  bandwidth: number;
};

export const renditions: Rendition[] = [
  {
    label: "360p",
    quality: VideoQuality.SD,
    width: 640,
    height: 360,
    videoBitrate: "800k",
    audioBitrate: "96k",
    bandwidth: 950000
  },
  {
    label: "720p",
    quality: VideoQuality.HD,
    width: 1280,
    height: 720,
    videoBitrate: "2500k",
    audioBitrate: "128k",
    bandwidth: 2900000
  },
  {
    label: "1080p",
    quality: VideoQuality.FULL_HD,
    width: 1920,
    height: 1080,
    videoBitrate: "5000k",
    audioBitrate: "192k",
    bandwidth: 5600000
  },
  {
    label: "4k",
    quality: VideoQuality.UHD_4K,
    width: 3840,
    height: 2160,
    videoBitrate: "15000k",
    audioBitrate: "256k",
    bandwidth: 16500000
  }
];

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stderr: string[] = [];

    process.stderr.on("data", (chunk) => {
      stderr.push(String(chunk));
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with ${code}: ${stderr.join("")}`));
    });
  });
}

export async function transcodeHls(inputPath: string, outputDirectory: string) {
  await mkdir(outputDirectory, { recursive: true });

  for (const rendition of renditions) {
    const renditionDirectory = join(outputDirectory, rendition.label);
    await mkdir(renditionDirectory, { recursive: true });

    await run("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `scale=w=${rendition.width}:h=${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-b:v",
      rendition.videoBitrate,
      "-maxrate",
      rendition.videoBitrate,
      "-bufsize",
      `${Number.parseInt(rendition.videoBitrate, 10) * 2}k`,
      "-threads",
      String(env.FFMPEG_THREADS),
      "-c:a",
      "aac",
      "-b:a",
      rendition.audioBitrate,
      "-ac",
      "2",
      "-f",
      "hls",
      "-hls_time",
      "6",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      join(renditionDirectory, "seg%03d.ts"),
      join(renditionDirectory, "index.m3u8")
    ]);
  }

  await writeFile(
    join(outputDirectory, "master.m3u8"),
    [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      ...renditions.flatMap((rendition) => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.width}x${rendition.height}`,
        `${rendition.label}/index.m3u8`
      ]),
      ""
    ].join("\n")
  );
}

export async function extractThumbnail(inputPath: string, outputPath: string) {
  await run("ffmpeg", [
    "-y",
    "-ss",
    "30",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath
  ]);
}
