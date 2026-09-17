-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReviewSettings" ADD COLUMN     "recycleBinOn" BOOLEAN NOT NULL DEFAULT false;
