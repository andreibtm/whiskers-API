import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeUtcDate = (date: Date) => {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(utc);
};

const daysBetween = (a: Date, b: Date) => {
  const diff = normalizeUtcDate(a).getTime() - normalizeUtcDate(b).getTime();
  return Math.floor(diff / DAY_MS);
};

export const validateStreakDate = (sessionDate: Date | null, now = new Date()) => {
  if (!sessionDate) return "Session date is required";
  const day = normalizeUtcDate(sessionDate);
  const today = normalizeUtcDate(now);

  if (day.getTime() > today.getTime()) return "Session date cannot be in the future";

  return null;
};

export const updateStreakFromSession = async (
  userId: string,
  startedAt: Date | null,
  endedAt: Date | null,
  client: Prisma.TransactionClient | typeof prisma = prisma,
  referenceDate: Date = new Date()
) => {
  if (!startedAt) return null;
  const startError = validateStreakDate(startedAt, referenceDate);
  if (startError) throw new Error(startError);

  const end = endedAt ?? startedAt;
  const endError = validateStreakDate(end, referenceDate);
  if (endError) throw new Error(endError);

  const startDay = normalizeUtcDate(startedAt);
  const endDay = normalizeUtcDate(end);

  // Build list of UTC days covered by the session (inclusive).
  const days: Date[] = [];
  for (let cursor = startDay; cursor.getTime() <= endDay.getTime(); cursor = new Date(cursor.getTime() + DAY_MS)) {
    days.push(cursor);
  }

  const applyDay = (state: { currentStreak: number; longestStreak: number; lastReadDate: Date | null; lastReadDay: Date | null }, day: Date) => {
    if (state.lastReadDay && day.getTime() < state.lastReadDay.getTime()) {
      return state; // ignore older backfills
    }

    if (!state.lastReadDay) {
      return { currentStreak: 1, longestStreak: Math.max(state.longestStreak, 1), lastReadDate: end, lastReadDay: day };
    }

    const diff = daysBetween(day, state.lastReadDay);
    if (diff === 0) {
      return state; // same day, no increment
    }
    if (diff === 1) {
      const nextCurrent = state.currentStreak + 1;
      return {
        currentStreak: nextCurrent,
        longestStreak: Math.max(state.longestStreak, nextCurrent),
        lastReadDate: end,
        lastReadDay: day,
      };
    }

    // Missed at least one day; reset current streak.
    return {
      currentStreak: 1,
      longestStreak: Math.max(state.longestStreak, 1),
      lastReadDate: end,
      lastReadDay: day,
    };
  };

  const run = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.readingStreak.findUnique({ where: { userId } });
    let state = existing
      ? {
          currentStreak: existing.currentStreak,
          longestStreak: existing.longestStreak,
          lastReadDate: existing.lastReadDate ?? null,
          lastReadDay: existing.lastReadDate ? normalizeUtcDate(existing.lastReadDate) : null,
        }
      : { currentStreak: 0, longestStreak: 0, lastReadDate: null as Date | null, lastReadDay: null as Date | null };

    for (const day of days) {
      state = applyDay(state, day);
    }

    if (!state.lastReadDay || endDay.getTime() >= state.lastReadDay.getTime()) {
      state.lastReadDate = end;
      state.lastReadDay = endDay;
    }

    if (existing) {
      return tx.readingStreak.update({
        where: { userId },
        data: {
          currentStreak: state.currentStreak,
          longestStreak: state.longestStreak,
          lastReadDate: state.lastReadDate,
        },
      });
    }

    return tx.readingStreak.create({
      data: {
        userId,
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        lastReadDate: state.lastReadDate,
      },
    });
  };

  if ("$transaction" in client) {
    return (client as typeof prisma).$transaction((tx) => run(tx));
  }

  return run(client);
};

export const getStreakForUser = async (userId: string) => {
  const streak = await prisma.readingStreak.findUnique({ where: { userId } });
  if (streak) return streak;
  return prisma.readingStreak.create({
    data: { userId, currentStreak: 0, longestStreak: 0, lastReadDate: null },
  });
};
