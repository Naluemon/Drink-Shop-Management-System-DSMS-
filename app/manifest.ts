import type { MetadataRoute } from "next";

// Without this file, "Add to Home Screen" had no icons array to read from
// at all — the home-screen shortcut fell back to a blank/generic tile.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DSMS — ระบบจัดการร้านเครื่องดื่ม",
    short_name: "DSMS",
    description: "ระบบบริหารจัดการร้านเครื่องดื่มแบบครบวงจร: ต้นทุน, POS, สต็อก, และรายงาน",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#FF9040",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
