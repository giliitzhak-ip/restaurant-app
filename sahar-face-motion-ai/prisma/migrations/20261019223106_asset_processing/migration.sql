-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PROCESSING', 'READY', 'REJECTED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "audioCodec" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "formatName" TEXT,
ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "previewKey" TEXT,
ADD COLUMN     "status" "AssetStatus" NOT NULL DEFAULT 'PROCESSING',
ADD COLUMN     "videoCodec" TEXT;
