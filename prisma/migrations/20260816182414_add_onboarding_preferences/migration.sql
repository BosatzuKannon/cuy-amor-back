-- CreateEnum
CREATE TYPE "InterestedIn" AS ENUM ('WOMEN', 'MEN', 'BOTH');

-- CreateEnum
CREATE TYPE "RelationshipGoal" AS ENUM ('CASUAL', 'FRIENDSHIP', 'RELATIONSHIP', 'CHAT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "interestedIn" "InterestedIn",
ADD COLUMN     "relationshipGoal" "RelationshipGoal";
