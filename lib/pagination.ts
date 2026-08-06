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

// Builds the visible page-number sequence with `null` standing in for an
// ellipsis — always shows page 1, the last page, and a window of 2 pages on
// either side of the current page, so long lists don't render one link per
// page. Shared by every paginated list's page-number UI.
export function buildPageSequence(page: number, totalPages: number): (number | null)[] {
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null);
    result.push(sorted[i]);
  }
  return result;
}
