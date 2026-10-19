-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "faces" JSONB;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "actualCostCents" INTEGER,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedCostCents" INTEGER,
ADD COLUMN     "quote" JSONB,
ADD COLUMN     "quoteExpiresAt" TIMESTAMP(3);
