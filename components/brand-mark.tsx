import { cn } from "@/lib/utils";

interface BrandIconProps {
  className?: string;
}

// "Sunrise Cup" — flat geometric takeaway cup with a straw and three boba
// pearls, on a fixed pink-orange-yellow gradient (not tied to the
// light/dark --primary/--accent tokens, unlike the rest of the UI — a brand
// mark should read the same regardless of theme, the way a logo normally
// would). Replaced the earlier photorealistic tea/milk-layer cup: that one
// used the app's earthy primary/accent palette and read as muted rather than
// distinctive. Straw and pearls are drawn in translucent white (currentColor
// at partial opacity) rather than a second gradient fill, so the background
// gradient shows through — same layering trick the old icon used for its
// tea/milk bands, just applied to different shapes.
export function BrandIcon({ className }: BrandIconProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF5E7E] via-[#FF9040] to-[#FFD23F] shadow-lg ring-1 ring-[#FF5E7E]/20",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-[58%] w-[58%] text-white"
        aria-hidden="true"
      >
        {/* cup body */}
        <path
          d="M6.8 6.8h10.4l-1.4 11.6a2 2 0 0 1-2 1.8h-3.6a2 2 0 0 1-2-1.8Z"
          fill="currentColor"
          opacity="0.92"
        />
        {/* liquid level line, translucent so the gradient reads through */}
        <path
          d="M7.6 12.4h8.8l-0.64 5.48a1.4 1.4 0 0 1-1.4 1.32H9.64a1.4 1.4 0 0 1-1.4-1.32Z"
          fill="currentColor"
          opacity="0.22"
        />
        {/* lid */}
        <rect x="6" y="5.2" width="12" height="2.4" rx="1.2" fill="currentColor" />
        {/* straw, pierced through the lid */}
        <line
          x1="15.8"
          y1="2.4"
          x2="12.6"
          y2="8"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.92"
        />
        {/* boba pearls */}
        <circle cx="9.8" cy="9.2" r="1" fill="currentColor" />
        <circle cx="12" cy="10" r="1" fill="currentColor" />
        <circle cx="14" cy="9" r="1" fill="currentColor" />
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
