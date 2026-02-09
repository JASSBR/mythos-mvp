-- Add DISCUSSION to GamePhase enum
ALTER TYPE "GamePhase" ADD VALUE IF NOT EXISTS 'DISCUSSION' AFTER 'ACTION';

-- Add WHISPER to MessageType enum
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'WHISPER';

-- Add recipientId column to Message table
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "recipientId" TEXT;
