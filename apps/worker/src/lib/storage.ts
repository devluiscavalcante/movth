import { createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "../config/env.js";
import { s3 } from "./s3.js";

function nodeReadable(body: unknown) {
  if (body instanceof Readable) {
    return body;
  }

  const webStream = (body as { transformToWebStream?: () => ReadableStream })?.transformToWebStream?.();

  if (webStream) {
    return Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
  }

  throw new Error("Unsupported S3 response body");
}

export async function downloadS3Object(key: string, destination: string) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error(`S3 object has no body: ${key}`);
  }

  await pipeline(nodeReadable(response.Body), createWriteStream(destination));
}

function contentTypeFor(filePath: string) {
  if (filePath.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl";
  }

  if (filePath.endsWith(".ts")) {
    return "video/mp2t";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return walkFiles(absolutePath);
      }

      return [absolutePath];
    })
  );

  return files.flat();
}

export async function uploadDirectoryToS3(directory: string, prefix: string) {
  const files = await walkFiles(directory);

  await Promise.all(
    files.map(async (filePath) => {
      const fileStat = await stat(filePath);
      const key = `${prefix}/${relative(directory, filePath).replaceAll("\\", "/")}`;

      if (!fileStat.isFile()) {
        return;
      }

      await new Upload({
        client: s3,
        params: {
          Bucket: env.AWS_S3_BUCKET,
          Key: key,
          Body: await import("node:fs").then((fs) => fs.createReadStream(filePath)),
          ContentType: contentTypeFor(filePath)
        }
      }).done();
    })
  );
}

export async function uploadFileToS3(filePath: string, key: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: await import("node:fs").then((fs) => fs.createReadStream(filePath)),
      ContentType: contentTypeFor(filePath),
      Metadata: {
        fileName: basename(filePath)
      }
    })
  );
}
