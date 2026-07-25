import { BrandIcon } from "@/components/brand-mark";

// Next.js shows this automatically while any route segment's server
// component is fetching data — every page.tsx here does an async data
// fetch before rendering (see e.g. app/dashboard/page.tsx), and none of
// them share a persistent layout, so without this every navigation was a
// blank screen until the new page's data resolved.
export default function Loading() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <BrandIcon className="h-12 w-12 animate-pulse" />
        <div className="border-muted border-t-primary h-6 w-6 animate-spin rounded-full border-2" />
      </div>
    </div>
  );
}
