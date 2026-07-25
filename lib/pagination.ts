export const DEFAULT_PAGE_SIZE = 20;

// searchParams values from Next.js can be string | string[] | undefined —
// normalize before parsing.
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function getSkip(page: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
  return (page - 1) * pageSize;
}

export function getTotalPages(total: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
