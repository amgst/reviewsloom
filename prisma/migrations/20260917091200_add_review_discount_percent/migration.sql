-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "discountCode" TEXT;

-- AlterTable
ALTER TABLE "ReviewSettings" ADD COLUMN     "reviewDiscountPercent" TEXT NOT NULL DEFAULT 'none';
