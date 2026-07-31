// Shared categorical palette (app/globals.css --chart-1..4 — --chart-5 is
// excluded everywhere identity-by-category is shown: it fails the dataviz
// skill's chroma-floor check and reads as gray). Used by both the dashboard's
// best-seller bars and the POS menu tiles so the same category always gets
// the same color across the app, not just within one screen.
const CATEGORY_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const UNCATEGORIZED_COLOR = "var(--muted-foreground)";
const UNCATEGORIZED_LABEL = "ไม่มีหมวดหมู่";

// Stable string -> color-index hash so a given category name always gets the
// same color across renders/screens (color follows the entity, not its
// position in a ranked list) — categories aren't a fixed enum in this app
// (owners name their own), so a hash stands in for a fixed manual order.
export function colorForCategory(categoryName: string | null): { color: string; label: string } {
  if (!categoryName) return { color: UNCATEGORIZED_COLOR, label: UNCATEGORIZED_LABEL };
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = (hash * 31 + categoryName.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CATEGORY_COLORS.length;
  return { color: CATEGORY_COLORS[index], label: categoryName };
}
