import { beforeEach } from "vitest";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await prisma.$transaction([
    prisma.like.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.post.deleteMany(),
    prisma.readingSession.deleteMany(),
    prisma.readingGoal.deleteMany(),
    prisma.readingStreak.deleteMany(),
    prisma.progress.deleteMany(),
    prisma.note.deleteMany(),
    prisma.book.deleteMany(),
    prisma.userFollow.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});
