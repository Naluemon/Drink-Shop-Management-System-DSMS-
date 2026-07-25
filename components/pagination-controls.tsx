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

  const linkClass = cn(buttonVariants({ variant: "outline", size: "sm" }));
  const disabledClass = "pointer-events-none opacity-50";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-muted-foreground text-sm">
        หน้า {page} จาก {totalPages} (ทั้งหมด {total} รายการ)
      </p>
      <div className="flex gap-2">
        <Link
          href={buildHref(basePath, page - 1, searchParams)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={cn(linkClass, page <= 1 && disabledClass)}
        >
          <ChevronLeft /> ก่อนหน้า
        </Link>
        <Link
          href={buildHref(basePath, page + 1, searchParams)}
          aria-disabled={page >= totalPages}
          tabIndex={page >= totalPages ? -1 : undefined}
          className={cn(linkClass, page >= totalPages && disabledClass)}
        >
          ถัดไป <ChevronRight />
        </Link>
      </div>
    </div>
  );
}
