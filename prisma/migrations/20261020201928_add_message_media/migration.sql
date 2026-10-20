-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mediaDurationMs" INTEGER,
ADD COLUMN     "mediaUrl" TEXT,
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT';
