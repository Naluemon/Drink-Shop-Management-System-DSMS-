import { ImageResponse } from "next/og";
import { brandIconGradientTile } from "@/lib/brand-icon-image";

// See app/icon-192/route.tsx — same reasoning, larger size for the manifest.
export async function GET() {
  return new ImageResponse(brandIconGradientTile({ detailed: true, rounded: 0 }), {
    width: 512,
    height: 512,
  });
}
