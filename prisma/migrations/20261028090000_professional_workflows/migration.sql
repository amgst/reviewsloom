ALTER TABLE "Review" ADD COLUMN "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requestId" TEXT, ADD COLUMN "source" TEXT NOT NULL DEFAULT 'storefront', ADD COLUMN "importKey" TEXT;
CREATE UNIQUE INDEX "Review_importKey_key" ON "Review"("importKey");
CREATE UNIQUE INDEX "Review_requestId_key" ON "Review"("requestId");
CREATE INDEX "Review_shop_deletedAt_createdAt_idx" ON "Review"("shop", "deletedAt", "createdAt");
CREATE INDEX "Review_shop_status_createdAt_idx" ON "Review"("shop", "status", "createdAt");
CREATE INDEX "Review_shop_email_idx" ON "Review"("shop", "email");
CREATE TABLE "ReviewEvent" ("id" TEXT NOT NULL, "shop" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "action" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ReviewEvent_shop_reviewId_createdAt_idx" ON "ReviewEvent"("shop", "reviewId", "createdAt");
ALTER TABLE "ReviewSettings" ADD COLUMN "widgetSeenAt" TIMESTAMP(3), ADD COLUMN "setupThemeConfirmedAt" TIMESTAMP(3),
 ADD COLUMN "requestDelayDays" INTEGER NOT NULL DEFAULT 7, ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 7,
 ADD COLUMN "automaticRequestsOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReviewRequest" ADD COLUMN "productId" TEXT, ADD COLUMN "status" TEXT NOT NULL DEFAULT 'QUEUED',
 ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "deliveredAt" TIMESTAMP(3), ADD COLUMN "bouncedAt" TIMESTAMP(3), ADD COLUMN "completedAt" TIMESTAMP(3),
 ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "lockedAt" TIMESTAMP(3), ADD COLUMN "reminderSentAt" TIMESTAMP(3),
 ADD COLUMN "orderVerified" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "dedupeKey" TEXT,
 ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "parentId" TEXT, ADD COLUMN "deliveryPayload" JSONB;
UPDATE "ReviewRequest" SET "status" = CASE WHEN "emailId" IS NOT NULL THEN 'SENT' WHEN "error" IS NOT NULL THEN 'FAILED' ELSE 'CANCELLED' END, "createdAt" = "sentAt";
CREATE UNIQUE INDEX "ReviewRequest_dedupeKey_key" ON "ReviewRequest"("dedupeKey");
CREATE INDEX "ReviewRequest_status_scheduledAt_idx" ON "ReviewRequest"("status", "scheduledAt");
CREATE INDEX "ReviewRequest_emailId_idx" ON "ReviewRequest"("emailId");
CREATE INDEX "ReviewRequest_shop_createdAt_idx" ON "ReviewRequest"("shop", "createdAt");
CREATE INDEX "ReviewRequest_shop_orderId_idx" ON "ReviewRequest"("shop", "orderId");
CREATE INDEX "ReviewRequest_shop_email_idx" ON "ReviewRequest"("shop", "email");
CREATE INDEX "Question_shop_email_idx" ON "Question"("shop", "email");
CREATE TABLE "StorefrontRateLimit" ("key" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "StorefrontRateLimit_pkey" PRIMARY KEY ("key"));
CREATE INDEX "StorefrontRateLimit_expiresAt_idx" ON "StorefrontRateLimit"("expiresAt");
CREATE TABLE "ReviewVote" ("id" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "voterKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ReviewVote_reviewId_voterKey_key" ON "ReviewVote"("reviewId", "voterKey");
CREATE INDEX "ReviewVote_createdAt_idx" ON "ReviewVote"("createdAt");
CREATE TABLE "EmailSuppression" ("id" TEXT NOT NULL, "shop" TEXT NOT NULL, "email" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "EmailSuppression_shop_email_key" ON "EmailSuppression"("shop", "email");
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
