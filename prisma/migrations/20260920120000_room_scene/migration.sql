-- CreateEnum
CREATE TYPE "SceneSnapTarget" AS ENUM ('WALL', 'FLOOR', 'NICHE', 'FREE');

-- AlterTable
ALTER TABLE "RoomDesign" ADD COLUMN     "scene" JSONB,
ADD COLUMN     "sceneVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RoomDesignVersion" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "label" TEXT,
    "snapshot" JSONB NOT NULL,
    "previewUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomDesignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignObjectCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignObjectCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignObjectAsset" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetUrl" TEXT NOT NULL,
    "realWidthCm" DOUBLE PRECISION NOT NULL,
    "realHeightCm" DOUBLE PRECISION NOT NULL,
    "snap" "SceneSnapTarget" NOT NULL DEFAULT 'WALL',
    "soldOnSite" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignObjectAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightingPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LightingPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomDesignVersion_designId_createdAt_idx" ON "RoomDesignVersion"("designId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DesignObjectCategory_key_key" ON "DesignObjectCategory"("key");

-- CreateIndex
CREATE INDEX "DesignObjectCategory_sortOrder_idx" ON "DesignObjectCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "DesignObjectAsset_categoryId_sortOrder_idx" ON "DesignObjectAsset"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "DesignObjectAsset_productId_idx" ON "DesignObjectAsset"("productId");

-- CreateIndex
CREATE INDEX "LightingPreset_sortOrder_idx" ON "LightingPreset"("sortOrder");

-- AddForeignKey
ALTER TABLE "RoomDesignVersion" ADD CONSTRAINT "RoomDesignVersion_designId_fkey" FOREIGN KEY ("designId") REFERENCES "RoomDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignObjectAsset" ADD CONSTRAINT "DesignObjectAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DesignObjectCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignObjectAsset" ADD CONSTRAINT "DesignObjectAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

