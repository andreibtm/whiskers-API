export const parsePagination = (page?: number, limit?: number) => {
  const safePage = !page || page < 1 ? 1 : page;
  const safeLimit = !limit || limit < 1 ? 10 : Math.min(limit, 100);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit, take: safeLimit };
};

export const buildMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});
