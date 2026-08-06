import { ImageResponse } from "next/og";
import { brandIconGradientTile } from "@/lib/brand-icon-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS "Add to Home Screen" icon.
export default function AppleIcon() {
  return new ImageResponse(brandIconGradientTile({ detailed: true, rounded: 0 }), { ...size });
}
