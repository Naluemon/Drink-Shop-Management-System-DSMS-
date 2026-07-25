import { cn } from "@/lib/utils";

interface BrandIconProps {
  className?: string;
}

// The cup glyph: a takeaway cup silhouette holding the shop's actual
// signature drink — ชาไทยเย็น (Thai iced tea) — rendered as two translucency
// bands (steeped tea on top, milk settling underneath) with a marbled swirl
// where they meet, plus ice cubes resting above the rim. Grounded in the
// real reference recipe (TESTING.md §2.2) rather than a generic cup-with-steam
// mark — steam would misread the drink as hot, so ice is the honest signal.
// Shared by the full lockup below and the compact nav-bar mark.
export function BrandIcon({ className }: BrandIconProps) {
  return (
    <div
      className={cn(
        "from-primary to-accent ring-primary/15 flex items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg ring-1",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-[58%] w-[58%] text-white"
        aria-hidden="true"
      >
        {/* tea layer */}
        <path d="M5.7 4.6 17.5 4.6 15.3 12 Q11.5 14 7.9 12 Z" fill="currentColor" opacity="0.9" />
        {/* milk layer, separated from the tea by the marbled swirl line */}
        <path
          d="M7.9 12 Q11.5 14 15.3 12 L13.6 17.6 Q13.2 18.3 12.4 18.3H10.6 Q9.8 18.3 9.5 17.6 Z"
          fill="currentColor"
          opacity="0.4"
        />
        {/* cup outline, drawn last so it cleanly caps both fill layers */}
        <path
          d="M5 3.5h13.2a.8.8 0 0 1 .79.9l-1.36 10.9A4 4 0 0 1 13.66 19H9.34a4 4 0 0 1-3.97-3.7L4 4.4a.8.8 0 0 1 .79-.9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* ice cubes peeking above the rim */}
        <rect
          x="7.3"
          y="1.1"
          width="2.6"
          height="2.6"
          rx="0.5"
          fill="currentColor"
          opacity="0.85"
          transform="rotate(-12 8.6 2.4)"
        />
        <rect
          x="12.4"
          y="0.6"
          width="2.3"
          height="2.3"
          rx="0.5"
          fill="currentColor"
          opacity="0.7"
          transform="rotate(10 13.55 1.75)"
        />
      </svg>
    </div>
  );
}

interface BrandMarkProps {
  className?: string;
  iconClassName?: string;
  showWordmark?: boolean;
}

// Full stacked lockup for auth screens: big icon badge + wordmark underneath.
export function BrandMark({ className, iconClassName, showWordmark = true }: BrandMarkProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <BrandIcon className={cn("h-16 w-16", iconClassName)} />
      {showWordmark && (
        <span className="font-heading text-foreground text-lg font-semibold tracking-tight">
          DSMS
        </span>
      )}
    </div>
  );
}
