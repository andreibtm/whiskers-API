import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { analyticsMonthlyQuerySchema, analyticsMonthlySchema, analyticsSummarySchema } from "./analytics.schemas.js";
import { prisma } from "../../lib/prisma.js";

const dayKey = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${date.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const distributePages = (
  session: { pagesRead: number; durationMinutes: number; startedAt: Date; endedAt: Date | null },
  windowStart: Date,
  windowEnd: Date
) => {
  const sessionStart = new Date(session.startedAt);
  const sessionEnd = session.endedAt
    ? new Date(session.endedAt)
    : new Date(sessionStart.getTime() + session.durationMinutes * 60000);

  const start = sessionStart < windowStart ? windowStart : sessionStart;
  const end = sessionEnd > windowEnd ? windowEnd : sessionEnd;
  if (end <= start) return new Map<string, number>();

  const segments: { key: string; minutes: number }[] = [];
  for (let cursor = start; cursor < end; ) {
    const nextBoundary = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1));
    const segmentEnd = nextBoundary < end ? nextBoundary : end;
    const minutes = Math.max(0, Math.floor((segmentEnd.getTime() - cursor.getTime()) / 60000));
    if (minutes > 0) {
      segments.push({ key: dayKey(cursor), minutes });
    }
    cursor = segmentEnd;
  }

  const totalMinutes = segments.reduce((acc, seg) => acc + seg.minutes, 0);
  if (totalMinutes === 0) {
    return new Map([[dayKey(start), session.pagesRead]]);
  }

  const allocations = new Map<string, number>();

  // If there are enough pages to give each day at least one, do so then distribute the rest by proportion.
  if (session.pagesRead >= segments.length) {
    const base = 1;
    segments.forEach((seg) => allocations.set(seg.key, base));
    const remainingPages = session.pagesRead - segments.length;

    const weightsTotal = totalMinutes;
    const provisional = segments.map((seg) => Math.floor((seg.minutes / weightsTotal) * remainingPages));
    let remainder = remainingPages - provisional.reduce((acc, v) => acc + v, 0);

    // Distribute remainder to segments with largest weights.
    const sortedIdx = segments
      .map((seg, idx) => ({ idx, weight: seg.minutes }))
      .sort((a, b) => (a.weight === b.weight ? a.idx - b.idx : b.weight - a.weight));

    for (const { idx } of sortedIdx) {
      if (remainder <= 0) break;
      provisional[idx] += 1;
      remainder -= 1;
    }

    provisional.forEach((portion, idx) => {
      const prev = allocations.get(segments[idx].key) ?? 0;
      allocations.set(segments[idx].key, prev + portion);
    });

    return allocations;
  }

  const floors = segments.map((segment) => Math.floor((segment.minutes / totalMinutes) * session.pagesRead));
  let remainder = session.pagesRead - floors.reduce((acc, v) => acc + v, 0);

  const sortedIdx = segments
    .map((seg, idx) => ({ idx, weight: seg.minutes }))
    .sort((a, b) => (a.weight === b.weight ? a.idx - b.idx : b.weight - a.weight));

  floors.forEach((portion, idx) => {
    const extra = sortedIdx.length && sortedIdx[0].idx === idx && remainder > 0 ? remainder : 0;
    const total = portion + extra;
    const prev = allocations.get(segments[idx].key) ?? 0;
    allocations.set(segments[idx].key, prev + total);
  });

  return allocations;
};

const allocateMinutes = (segments: { key: string; minutesActual: number }[], durationMinutes: number) => {
  const totalActual = segments.reduce((sum, seg) => sum + seg.minutesActual, 0);
  if (durationMinutes >= totalActual) {
    return segments.map((s) => ({ key: s.key, minutes: s.minutesActual }));
  }

  if (segments.length === 1) {
    return [{ key: segments[0].key, minutes: durationMinutes }];
  }

  const allocations: { key: string; minutes: number }[] = [];

  const firstActual = segments[0].minutesActual;
  let remaining = durationMinutes;

  const first = Math.min(firstActual, remaining);
  allocations.push({ key: segments[0].key, minutes: first });
  remaining -= first;

  if (segments.length === 2) {
    const last = Math.min(segments[1].minutesActual, remaining);
    allocations.push({ key: segments[1].key, minutes: last });
    return allocations;
  }

  const lastActual = segments[segments.length - 1].minutesActual;
  const last = Math.min(lastActual, remaining);
  remaining -= last;

  const middleSegments = segments.slice(1, -1);
  const middleTotal = middleSegments.reduce((sum, seg) => sum + seg.minutesActual, 0);

  if (middleSegments.length === 0) {
    allocations.push({ key: segments[segments.length - 1].key, minutes: last });
    return allocations;
  }

  let distributed = 0;
  middleSegments.forEach((seg, idx) => {
    if (middleTotal === 0) {
      allocations.push({ key: seg.key, minutes: 0 });
      return;
    }
    const raw = Math.round((seg.minutesActual / middleTotal) * remaining);
    const minutes = idx === middleSegments.length - 1 ? Math.max(0, remaining - distributed) : raw;
    distributed += minutes;
    allocations.push({ key: seg.key, minutes });
  });

  allocations.push({ key: segments[segments.length - 1].key, minutes: last });
  return allocations;
};

export default async function analyticsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/summary",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["analytics"],
        security: [{ bearerAuth: [] }],
        response: {
          200: analyticsSummarySchema,
        },
      },
    },
    async (request, reply) => {
      const aggregate = await prisma.readingSession.aggregate({
        where: { userId: request.user.id },
        _sum: { pagesRead: true, durationMinutes: true },
        _count: { _all: true },
      });

      return reply.status(200).send({
        totalPagesRead: aggregate._sum.pagesRead ?? 0,
        totalMinutesRead: aggregate._sum.durationMinutes ?? 0,
        sessionCount: aggregate._count._all ?? 0,
      });
    }
  );

  server.get(
    "/monthly",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["analytics"],
        querystring: analyticsMonthlyQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: analyticsMonthlySchema,
        },
      },
    },
    async (request, reply) => {
      const { year, month } = request.query;
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));

      const sessions = await prisma.readingSession.findMany({
        where: {
          userId: request.user.id,
          OR: [
            { endedAt: { gte: start, lt: end } },
            { endedAt: null, startedAt: { gte: start, lt: end } },
          ],
        },
        select: {
          pagesRead: true,
          durationMinutes: true,
          startedAt: true,
          endedAt: true,
        },
      });

      const dayBuckets = new Map<string, { pagesRead: number; minutesRead: number; sessionCount: number }>();

      for (const session of sessions) {
        const effectiveDate = new Date(session.endedAt ?? session.startedAt);
        if (effectiveDate < start || effectiveDate >= end) continue;

        const key = dayKey(effectiveDate);
        const bucket = dayBuckets.get(key) ?? { pagesRead: 0, minutesRead: 0, sessionCount: 0 };
        bucket.pagesRead += session.pagesRead;
        bucket.minutesRead += session.durationMinutes;
        bucket.sessionCount += 1;
        dayBuckets.set(key, bucket);
      }

      const days = Array.from(dayBuckets.entries())
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));

      const totals = days.reduce(
        (acc, day) => {
          acc.totalPagesRead += day.pagesRead;
          acc.totalMinutesRead += day.minutesRead;
          acc.sessionCount += day.sessionCount;
          return acc;
        },
        { totalPagesRead: 0, totalMinutesRead: 0, sessionCount: 0 }
      );

      return reply.status(200).send({
        year,
        month,
        days,
        ...totals,
      });
    }
  );
}
