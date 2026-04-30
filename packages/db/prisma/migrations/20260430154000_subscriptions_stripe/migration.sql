ALTER TABLE "users"
  ADD COLUMN "stripe_customer_id" TEXT;

ALTER TABLE "plans"
  ADD COLUMN "stripe_price_id" TEXT;

ALTER TABLE "subscriptions"
  ADD COLUMN "plan_id" UUID,
  ADD COLUMN "stripe_customer_id" TEXT;

UPDATE "subscriptions" s
SET "stripe_customer_id" = 'legacy_customer_' || s."user_id"::text
WHERE s."stripe_customer_id" IS NULL;

ALTER TABLE "subscriptions"
  ALTER COLUMN "stripe_customer_id" SET NOT NULL;

CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");
CREATE UNIQUE INDEX "plans_stripe_price_id_key" ON "plans"("stripe_price_id");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
