/*
  Warnings:

  - You are about to drop the column `cashValueCops` on the `VirtualGift` table. All the data in the column will be lost.
  - Added the required column `cashValueInCents` to the `VirtualGift` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'WELCOME_GIFT';
ALTER TYPE "TransactionType" ADD VALUE 'NINJA_ACTIVATED';
ALTER TYPE "TransactionType" ADD VALUE 'ZUMBIDO_SENT';
ALTER TYPE "TransactionType" ADD VALUE 'VIP_SUBSCRIPTION';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "giftId" UUID,
ADD COLUMN     "isSystemMessage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replyToId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyCuyazosLeft" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dailyZumbidosLeft" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isLeyenda" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isNinja" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeen" TIMESTAMP(3),
ADD COLUMN     "leyendaExpiresAt" TIMESTAMP(3),
ADD COLUMN     "ninjaExpiresAt" TIMESTAMP(3),
ADD COLUMN     "referralEarningsInCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VirtualGift" DROP COLUMN "cashValueCops",
ADD COLUMN     "cashValueInCents" INTEGER NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CoinPackage" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "coinsAmount" INTEGER NOT NULL,
    "priceInCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "badge" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRevenue" (
    "id" UUID NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformRevenue_source_idx" ON "PlatformRevenue"("source");

-- CreateIndex
CREATE INDEX "PlatformRevenue_createdAt_idx" ON "PlatformRevenue"("createdAt");

-- CreateIndex
CREATE INDEX "Message_giftId_idx" ON "Message"("giftId");

-- CreateIndex
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");

-- CreateIndex
CREATE INDEX "User_lastSeen_idx" ON "User"("lastSeen");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_city_interestedIn_idx" ON "User"("city", "interestedIn");

-- CreateIndex
CREATE INDEX "VirtualGift_coinCost_idx" ON "VirtualGift"("coinCost");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "VirtualGift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
