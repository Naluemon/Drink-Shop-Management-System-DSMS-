import { ImageResponse } from "next/og";
import { brandIconGradientTile } from "@/lib/brand-icon-image";

// Referenced from app/manifest.ts — Android's "Add to Home Screen" reads
// the Web App Manifest's icons array, not app/icon.tsx (that one's just the
// browser-tab favicon), so this needs its own stable, unhashed URL.
export async function GET() {
  return new ImageResponse(brandIconGradientTile({ detailed: true, rounded: 0 }), {
    width: 192,
    height: 192,
  });
}
