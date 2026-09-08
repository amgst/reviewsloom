-- AlterTable
ALTER TABLE "ReviewRequest" ADD COLUMN     "emailId" TEXT,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "productUrl" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;
