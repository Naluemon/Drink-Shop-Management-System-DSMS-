// Shared glyph for the generated PWA/home-screen icons (app/icon.tsx,
// app/apple-icon.tsx, app/icon-192, app/icon-512). These run through
// next/og's ImageResponse (satori), which renders independently of the DOM
// and Tailwind, so it can't reuse components/brand-mark.tsx's BrandIcon
// directly — this is the same "Sunrise Cup" glyph redrawn for that renderer.
export function brandIconGradientTile({
  detailed = true,
  rounded = 0,
}: {
  // Skip the liquid line + pearls at very small sizes (e.g. the 32px tab
  // favicon) where they'd just read as mud.
  detailed?: boolean;
  // 0 = full-bleed square, required for the iOS home-screen icon (iOS
  // applies its own corner mask on top — a pre-rounded source double-masks).
  rounded?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #FF5E7E 0%, #FF9040 60%, #FFD23F 100%)",
        borderRadius: rounded,
      }}
    >
      <svg width="62%" height="62%" viewBox="0 0 24 24" fill="none">
        <path
          d="M6.8 6.8h10.4l-1.4 11.6a2 2 0 0 1-2 1.8h-3.6a2 2 0 0 1-2-1.8Z"
          fill="#fff"
          opacity={0.92}
        />
        {detailed && (
          <path
            d="M7.6 12.4h8.8l-0.64 5.48a1.4 1.4 0 0 1-1.4 1.32H9.64a1.4 1.4 0 0 1-1.4-1.32Z"
            fill="#fff"
            opacity={0.22}
          />
        )}
        <rect x="6" y="5.2" width="12" height="2.4" rx="1.2" fill="#fff" />
        <line
          x1="15.8"
          y1="2.4"
          x2="12.6"
          y2="8"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity={0.92}
        />
        {detailed && (
          // <g>, not a fragment — satori (next/og's ImageResponse renderer)
          // reads node.type as a string tag name and throws on a Fragment's
          // Symbol type ("Cannot convert a Symbol value to a string").
          <g>
            <circle cx="9.8" cy="9.2" r="1" fill="#fff" />
            <circle cx="12" cy="10" r="1" fill="#fff" />
            <circle cx="14" cy="9" r="1" fill="#fff" />
          </g>
        )}
      </svg>
    </div>
  );
}
