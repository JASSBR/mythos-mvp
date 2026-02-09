-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PLAYER');

-- AlterTable: add missing columns to User
ALTER TABLE "User" ADD COLUMN "oauthProvider" TEXT;
ALTER TABLE "User" ADD COLUMN "oauthId" TEXT;
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'PLAYER';
ALTER TABLE "User" ADD COLUMN "bannedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_oauthProvider_oauthId_key" ON "User"("oauthProvider", "oauthId");
