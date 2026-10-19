-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "thumbnailKey" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "mainCharacterId" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_mainCharacterId_fkey" FOREIGN KEY ("mainCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
