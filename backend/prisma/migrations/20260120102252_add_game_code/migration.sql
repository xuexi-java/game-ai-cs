/*
  Warnings:

  - A unique constraint covering the columns `[gameCode]` on the table `Game` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `IssueType` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gameId,areaCode]` on the table `Server` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `gameCode` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Session_status_priorityScore_queuedAt_idx";

-- AlterTable
-- Step 1: 先添加 gameCode 字段（允许为空）
ALTER TABLE "Game" ADD COLUMN     "gameCode" TEXT,
ADD COLUMN     "playerApiEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "playerApiNonce" VARCHAR(32),
ADD COLUMN     "playerApiSecret" TEXT;

-- Step 2: 为现有三个游戏设置 gameCode
UPDATE "Game" SET "gameCode" = '10001' WHERE "name" = '新弹弹堂';
UPDATE "Game" SET "gameCode" = '10002' WHERE "name" = '弹弹堂大冒险';
UPDATE "Game" SET "gameCode" = '10003' WHERE "name" = '页游弹弹堂';

-- Step 3: 设置为非空约束
ALTER TABLE "Game" ALTER COLUMN "gameCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "IssueType" ADD COLUMN     "routeMode" VARCHAR(16) NOT NULL DEFAULT 'AI';

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "areaCode" VARCHAR(64);

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "closeReason" VARCHAR(64),
ADD COLUMN     "closedBy" VARCHAR(32),
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "playerAreaId" VARCHAR(64),
ADD COLUMN     "playerLastSeenAt" TIMESTAMP(3),
ADD COLUMN     "playerUid" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "Game_gameCode_key" ON "Game"("gameCode");

-- CreateIndex
CREATE INDEX "Game_gameCode_idx" ON "Game"("gameCode");

-- CreateIndex
CREATE UNIQUE INDEX "IssueType_name_key" ON "IssueType"("name");

-- CreateIndex
CREATE INDEX "Server_gameId_areaCode_idx" ON "Server"("gameId", "areaCode");

-- CreateIndex
CREATE UNIQUE INDEX "Server_gameId_areaCode_key" ON "Server"("gameId", "areaCode");

-- CreateIndex
CREATE INDEX "Session_status_priorityScore_queuedAt_idx" ON "Session"("status", "priorityScore", "queuedAt");

-- CreateIndex
CREATE INDEX "Ticket_gameId_playerUid_status_idx" ON "Ticket"("gameId", "playerUid", "status");

-- CreateIndex
CREATE INDEX "Ticket_status_lastMessageAt_idx" ON "Ticket"("status", "lastMessageAt");
