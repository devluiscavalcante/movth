CREATE TYPE "TitleType" AS ENUM ('MOVIE', 'SERIES');
CREATE TYPE "VideoQuality" AS ENUM ('SD', 'HD', 'FULL_HD', 'UHD_4K');
CREATE TYPE "VideoAssetStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

CREATE TABLE "plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "max_profiles" INTEGER NOT NULL,
  "max_streams" INTEGER NOT NULL,
  "has_4k" BOOLEAN NOT NULL DEFAULT false,
  "price_cents" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "plan_id" UUID,
  "trial_ends_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "avatar_url" TEXT,
  "is_kids" BOOLEAN NOT NULL DEFAULT false,
  "pin_hash" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "titles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "TitleType" NOT NULL,
  "title" TEXT NOT NULL,
  "synopsis" TEXT NOT NULL,
  "release_year" INTEGER NOT NULL,
  "rating" TEXT NOT NULL,
  "tmdb_id" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "titles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "episodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title_id" UUID NOT NULL,
  "season" INTEGER NOT NULL,
  "number" INTEGER NOT NULL,
  "duration_s" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title_id" UUID NOT NULL,
  "episode_id" UUID,
  "quality" "VideoQuality" NOT NULL,
  "hls_manifest_url" TEXT NOT NULL,
  "status" "VideoAssetStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "watch_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL,
  "title_id" UUID NOT NULL,
  "episode_id" UUID,
  "position_s" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "watch_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "watchlist" (
  "profile_id" UUID NOT NULL,
  "title_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "watchlist_pkey" PRIMARY KEY ("profile_id", "title_id")
);

CREATE TABLE "subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "stripe_sub_id" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL,
  "current_period_end" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "active_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "device_type" TEXT NOT NULL,
  "ip_address" TEXT NOT NULL,
  "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "active_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_name_key" ON "plans" ("name");
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE INDEX "users_plan_id_idx" ON "users" ("plan_id");
CREATE INDEX "profiles_user_id_idx" ON "profiles" ("user_id");
CREATE UNIQUE INDEX "profiles_user_id_name_key" ON "profiles" ("user_id", "name");
CREATE UNIQUE INDEX "titles_tmdb_id_key" ON "titles" ("tmdb_id");
CREATE INDEX "titles_type_idx" ON "titles" ("type");
CREATE INDEX "titles_release_year_idx" ON "titles" ("release_year");
CREATE INDEX "titles_title_idx" ON "titles" ("title");
CREATE INDEX "episodes_title_id_idx" ON "episodes" ("title_id");
CREATE UNIQUE INDEX "episodes_title_id_season_number_key" ON "episodes" ("title_id", "season", "number");
CREATE INDEX "video_assets_title_id_idx" ON "video_assets" ("title_id");
CREATE INDEX "video_assets_episode_id_idx" ON "video_assets" ("episode_id");
CREATE INDEX "video_assets_status_idx" ON "video_assets" ("status");
CREATE UNIQUE INDEX "video_assets_title_id_episode_id_quality_key" ON "video_assets" ("title_id", "episode_id", "quality");
CREATE INDEX "watch_history_profile_id_updated_at_idx" ON "watch_history" ("profile_id", "updated_at");
CREATE INDEX "watch_history_title_id_idx" ON "watch_history" ("title_id");
CREATE INDEX "watch_history_episode_id_idx" ON "watch_history" ("episode_id");
CREATE UNIQUE INDEX "watch_history_profile_id_title_id_episode_id_key" ON "watch_history" ("profile_id", "title_id", "episode_id");
CREATE INDEX "watchlist_title_id_idx" ON "watchlist" ("title_id");
CREATE UNIQUE INDEX "subscriptions_stripe_sub_id_key" ON "subscriptions" ("stripe_sub_id");
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" ("user_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" ("status");
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions" ("current_period_end");
CREATE INDEX "active_sessions_user_id_idx" ON "active_sessions" ("user_id");
CREATE INDEX "active_sessions_last_seen_idx" ON "active_sessions" ("last_seen");

ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
