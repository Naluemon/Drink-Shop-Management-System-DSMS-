import { ImageResponse } from "next/og";
import { brandIconGradientTile } from "@/lib/brand-icon-image";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Browser-tab favicon. Supersedes the old static app/favicon.ico, which
// Next.js still serves as a fallback for clients that request it directly.
export default function Icon() {
  return new ImageResponse(brandIconGradientTile({ detailed: false, rounded: 7 }), { ...size });
}
