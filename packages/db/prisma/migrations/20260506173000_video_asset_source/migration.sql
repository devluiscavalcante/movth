CREATE TYPE "VideoSource" AS ENUM ('HLS', 'EMBED');

ALTER TABLE "video_assets"
ADD COLUMN "source" "VideoSource" NOT NULL DEFAULT 'HLS';

ALTER TABLE "video_assets"
DROP CONSTRAINT IF EXISTS "video_assets_title_id_episode_id_quality_key";

DROP INDEX IF EXISTS "video_assets_title_id_episode_id_quality_key";

CREATE INDEX "video_assets_source_idx" ON "video_assets"("source");

CREATE UNIQUE INDEX "video_assets_title_id_episode_id_quality_source_key"
ON "video_assets"("title_id", "episode_id", "quality", "source");
