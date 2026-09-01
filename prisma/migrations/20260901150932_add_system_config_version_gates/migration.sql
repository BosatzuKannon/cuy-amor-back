-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "latestVersionCode" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updateUrl" TEXT NOT NULL DEFAULT 'market://details?id=com.bosatzu.frontcuyamor';
