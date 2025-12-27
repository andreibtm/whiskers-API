import { prisma } from "../../lib/prisma.js";

export const upsertGoal = async (userId: string, year: number, targetBooks: number) => {
  return prisma.readingGoal.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, targetBooks },
    update: { targetBooks },
  });
};

export const incrementGoalForCompletion = async (userId: string, bookId: string, finishedAt: Date) => {
  const year = finishedAt.getUTCFullYear();
  const goal = await prisma.readingGoal.findUnique({ where: { userId_year: { userId, year } } });
  if (!goal) return null;

  return prisma.readingGoal.update({
    where: { userId_year: { userId, year } },
    data: { completedBooks: { increment: 1 } },
  });
};

export const getGoal = async (userId: string, year: number) => {
  return prisma.readingGoal.findUnique({ where: { userId_year: { userId, year } } });
};
