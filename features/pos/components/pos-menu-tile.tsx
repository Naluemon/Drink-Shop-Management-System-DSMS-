"use client";

import { useState } from "react";
import { Coffee, UtensilsCrossed } from "lucide-react";
import { colorForCategory } from "@/lib/category-color";
import { formatBaht } from "@/lib/utils";
import type { PosMenu } from "./pos-terminal";

interface PosMenuTileProps {
  menu: PosMenu;
  onClick: () => void;
}

// Every menu already carries an imageUrl (set once in the admin menu form)
// that nothing in the app has ever actually rendered — showing it here is
// the single biggest visual upgrade available on this screen without new
// data. Falls back to a food/drink icon (category-hashed color) both when
// there's no URL and when the URL fails to load, so a shop that hasn't
// uploaded photos yet still gets a tile that looks intentional — a first-
// letter monogram was tried first, but Thai menu names cluster on the same
// leading consonant constantly (กาแฟปั่น/กาแฟเย็น, ไข่เจียว/ไข่ดาว,
// ชาไทย/ชานม/ชามะนาว), so half the grid showed the same giant letter
// repeated with nothing to actually tell items apart.
export function PosMenuTile({ menu, onClick }: PosMenuTileProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const accent = colorForCategory(menu.categoryName);
  const showImage = !!menu.imageUrl && !imageFailed;
  const PlaceholderIcon = menu.categoryType === "food" ? UtensilsCrossed : Coffee;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group border-border bg-card hover:border-primary/50 relative flex flex-col overflow-hidden rounded-2xl border text-left shadow-sm transition-all hover:shadow-md active:scale-[0.97]"
    >
      <div
        className="flex aspect-square w-full items-center justify-center overflow-hidden"
        style={{ backgroundColor: `color-mix(in oklab, ${accent.color} 18%, var(--card))` }}
      >
        {showImage ? (
          // imageUrl is an arbitrary owner-entered URL, not a local/optimizable asset
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={menu.imageUrl!}
            alt={menu.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <PlaceholderIcon className="size-9" style={{ color: accent.color }} strokeWidth={1.5} />
        )}
      </div>

      <span
        className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow"
        style={{ backgroundColor: accent.color }}
      >
        {accent.label}
      </span>

      <div className="flex flex-1 flex-col justify-between gap-1.5 p-3">
        <span className="line-clamp-2 text-sm leading-tight font-medium">{menu.name}</span>
        <span className="font-heading text-primary text-base font-bold tabular-nums">
          {formatBaht(Number(menu.basePrice))}
        </span>
      </div>
    </button>
  );
}
