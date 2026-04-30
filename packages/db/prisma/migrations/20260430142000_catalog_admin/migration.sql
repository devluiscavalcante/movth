CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "TitleStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'ARCHIVED');

ALTER TABLE "users"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

ALTER TABLE "titles"
  ADD COLUMN "status" "TitleStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "poster_url" TEXT,
  ADD COLUMN "backdrop_url" TEXT;

ALTER TABLE "video_assets"
  ADD COLUMN "thumbnail_url" TEXT;

CREATE TABLE "genres" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "title_genres" (
  "title_id" UUID NOT NULL,
  "genre_id" UUID NOT NULL,

  CONSTRAINT "title_genres_pkey" PRIMARY KEY ("title_id","genre_id")
);

CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");
CREATE INDEX "title_genres_genre_id_idx" ON "title_genres"("genre_id");
CREATE INDEX "titles_status_idx" ON "titles"("status");

ALTER TABLE "title_genres"
  ADD CONSTRAINT "title_genres_title_id_fkey"
  FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "title_genres"
  ADD CONSTRAINT "title_genres_genre_id_fkey"
  FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;
