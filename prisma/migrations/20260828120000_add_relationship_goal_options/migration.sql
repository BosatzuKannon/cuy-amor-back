-- AlterEnum
-- New intent options: "Dejar que fluya" (LET_IT_FLOW) and "Algo casual" (LIGHT_CASUAL)
ALTER TYPE "RelationshipGoal" ADD VALUE 'LET_IT_FLOW' AFTER 'CHAT';
ALTER TYPE "RelationshipGoal" ADD VALUE 'LIGHT_CASUAL' AFTER 'LET_IT_FLOW';