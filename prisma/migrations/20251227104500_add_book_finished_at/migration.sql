-- Add finishedAt to Book for completion tracking
ALTER TABLE "Book" ADD COLUMN "finishedAt" TIMESTAMPTZ(6);
