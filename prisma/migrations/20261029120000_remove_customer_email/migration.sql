-- Intentionally erase structured customer email data and saved invitation payloads.
-- Stop old application instances before applying this incompatible migration.
BEGIN;
DROP TABLE "ReviewRequest";
DROP TABLE "EmailSuppression";
ALTER TABLE "Review" DROP COLUMN "email", DROP COLUMN "verifiedPurchase", DROP COLUMN "requestId";
ALTER TABLE "Question" DROP COLUMN "email";
ALTER TABLE "ReviewSettings"
 DROP COLUMN "requestEmailOn", DROP COLUMN "senderName", DROP COLUMN "supportEmail",
 DROP COLUMN "requestDelayDays", DROP COLUMN "reminderDays", DROP COLUMN "automaticRequestsOn";
UPDATE "Review" SET "importKey" = NULL WHERE "importKey" IS NOT NULL;
UPDATE "Review" SET "source" = 'storefront' WHERE "source" = 'request';
UPDATE "ReviewSettings" SET "customerEligibility" = 'everyone' WHERE "customerEligibility" = 'verifiedBuyer';
COMMIT;
