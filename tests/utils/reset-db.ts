import { prisma } from "../../src/lib/prisma.js";

// Clears all application tables in FK-safe order to keep tests isolated.
export const resetDatabase = async () => {
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.readingSession.deleteMany();
  await prisma.readingGoal.deleteMany();
  await prisma.readingStreak.deleteMany();
  await prisma.progress.deleteMany();
  await prisma.note.deleteMany();
  await prisma.book.deleteMany();
  await prisma.userFollow.deleteMany();
  await prisma.user.deleteMany();
};
