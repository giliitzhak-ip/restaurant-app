/*
  Warnings:

  - You are about to drop the column `thumbnailKey` on the `Asset` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "thumbnailKey";

-- AlterTable
ALTER TABLE "AudioAnalysis" ADD COLUMN     "tempoAlternativeBpm" DOUBLE PRECISION;
