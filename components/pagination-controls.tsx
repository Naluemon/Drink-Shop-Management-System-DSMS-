import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  // Any filter params (search, category, date range, ...) that must survive
  // a page change — merged into the query string alongside `page`.
  searchParams?: Record<string, string | undefined>;
}

function buildHref(
  basePath: string,
  page: number,
  searchParams?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

// Builds the visible page-number sequence with `null` standing in for an
// ellipsis — always shows page 1, the last page, and a window of 2 pages on
// either side of the current page, so long lists don't render one link per
// page.
function buildPageSequence(page: number, totalPages: number): (number | null)[] {
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null);
    result.push(sorted[i]);
  }
  return result;
}

// Server-renderable (no client JS needed) — plain links carry the page
// number in the URL, so pagination works with SSR/Suspense loading states
// and is bookmarkable.
export function PaginationControls({
  page,
  totalPages,
  total,
  basePath,
  searchParams,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const outlineClass = cn(buttonVariants({ variant: "outline", size: "sm" }));
  const disabledClass = "pointer-events-none opacity-50";
  const pageSequence = buildPageSequence(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-muted-foreground text-sm">
        หน้า {page} จาก {totalPages} (ทั้งหมด {total} รายการ)
      </p>
      <div className="flex items-center gap-1.5">
        <Link
          href={buildHref(basePath, page - 1, searchParams)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          aria-label="หน้าก่อนหน้า"
          className={cn(outlineClass, "size-8 p-0", page <= 1 && disabledClass)}
        >
          <ChevronLeft />
        </Link>

        {pageSequence.map((p, i) =>
          p === null ? (
            <span key={`ellipsis-${i}`} className="text-muted-foreground px-1 text-sm">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={buildHref(basePath, p, searchParams)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: p === page ? "default" : "outline", size: "sm" }),
                "size-8 p-0",
              )}
            >
              {p}
            </Link>
          ),
        )}

        <Link
          href={buildHref(basePath, page + 1, searchParams)}
          aria-disabled={page >= totalPages}
          tabIndex={page >= totalPages ? -1 : undefined}
          aria-label="หน้าถัดไป"
          className={cn(outlineClass, "size-8 p-0", page >= totalPages && disabledClass)}
        >
          <ChevronRight />
        </Link>
      </div>
    </div>
  );
}
