"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Coffee, UtensilsCrossed } from "lucide-react";
import { checkout } from "../actions/checkout";
import { VariantModifierModal } from "./variant-modifier-modal";
import { CartPanel, type CartLine } from "./cart-panel";
import { PosMenuTile } from "./pos-menu-tile";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/search-input";
import { colorForCategory } from "@/lib/category-color";
import { formatBaht } from "@/lib/utils";

export interface PosMenuVariant {
  id: string;
  name: string;
  priceDelta: string;
  isDefault: boolean;
  cost: number;
}

export interface PosModifier {
  id: string;
  name: string;
  priceDelta: string;
  cost: number;
}

export interface PosModifierGroup {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  modifiers: PosModifier[];
}

export interface PosMenu {
  id: string;
  name: string;
  basePrice: string;
  imageUrl: string | null;
  categoryName: string | null;
  categoryType: "food" | "drink";
  mainRecipeCost: number;
  variants: PosMenuVariant[];
  modifierGroups: PosModifierGroup[];
}

const TYPE_LABELS: Record<"food" | "drink", string> = { food: "อาหาร", drink: "เครื่องดื่ม" };
const TYPE_ICONS: Record<"food" | "drink", typeof Coffee> = {
  food: UtensilsCrossed,
  drink: Coffee,
};

interface PosTerminalProps {
  menus: PosMenu[];
}

let lineKeySeq = 0;

export function PosTerminal({ menus }: PosTerminalProps) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [modalMenu, setModalMenu] = useState<PosMenu | null>(null);
  const [billDiscountAmount, setBillDiscountAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr">("cash");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    transactionId: string;
    totalAmount: number;
    isStockDeficit: boolean;
  } | null>(null);

  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<"food" | "drink" | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const typesPresent = useMemo(() => {
    const set = new Set(menus.map((m) => m.categoryType));
    return Array.from(set);
  }, [menus]);

  // Category pills are scoped to the selected type so picking "อาหาร" doesn't
  // still show drink categories — reset back to "all categories" whenever the
  // type changes, since the previously active category may not apply anymore.
  const categories = useMemo(() => {
    const inType = activeType ? menus.filter((m) => m.categoryType === activeType) : menus;
    const set = new Set(inType.map((m) => m.categoryName ?? "อื่นๆ"));
    return Array.from(set);
  }, [menus, activeType]);

  function handleTypeChange(type: "food" | "drink" | null) {
    setActiveType(type);
    setActiveCategory(null);
  }

  const visibleMenus = menus.filter((m) => {
    if (activeType && m.categoryType !== activeType) return false;
    if (activeCategory && (m.categoryName ?? "อื่นๆ") !== activeCategory) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      m.name.toLowerCase().includes(term) ||
      (m.categoryName ?? "").toLowerCase().includes(term) ||
      TYPE_LABELS[m.categoryType].toLowerCase().includes(term) ||
      m.basePrice.includes(term)
    );
  });

  function handleMenuClick(menu: PosMenu) {
    if (menu.variants.length > 0 || menu.modifierGroups.length > 0) {
      setModalMenu(menu);
      return;
    }
    addToCart(menu, { variantId: null, modifierIds: [] });
  }

  function addToCart(
    menu: PosMenu,
    selection: { variantId: string | null; modifierIds: string[] },
  ) {
    const variant = selection.variantId
      ? menu.variants.find((v) => v.id === selection.variantId)
      : null;
    const selectedModifiers = menu.modifierGroups
      .flatMap((g) => g.modifiers)
      .filter((m) => selection.modifierIds.includes(m.id));

    const unitPrice =
      Number(menu.basePrice) +
      (variant ? Number(variant.priceDelta) : 0) +
      selectedModifiers.reduce((sum, m) => sum + Number(m.priceDelta), 0);

    const line: CartLine = {
      key: `line-${lineKeySeq++}`,
      menuId: menu.id,
      menuName: menu.name,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      modifierIds: selection.modifierIds,
      modifierNames: selectedModifiers.map((m) => m.name),
      quantity: 1,
      unitPrice,
      lineDiscountAmount: 0,
    };
    setCart((prev) => [...prev, line]);
  }

  function updateQuantity(key: string, quantity: number) {
    if (quantity < 1) return;
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }

  function updateLineDiscount(key: string, amount: number) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, lineDiscountAmount: amount } : l)));
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleCheckout() {
    setError(null);
    setIsCheckingOut(true);
    try {
      const result = await checkout({
        items: cart.map((l) => ({
          menuId: l.menuId,
          variantId: l.variantId ?? undefined,
          modifierIds: l.modifierIds,
          quantity: l.quantity,
          lineDiscountAmount: l.lineDiscountAmount,
        })),
        billDiscountAmount,
        paymentMethod,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setReceipt({
        transactionId: result!.transactionId!,
        totalAmount: result!.totalAmount!,
        isStockDeficit: !!result!.isStockDeficit,
      });
      setCart([]);
      setBillDiscountAmount(0);
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {/* Search is additive on top of FR-POS-01's tap-to-order grid, not a
            replacement — useful once the menu grows past a glance-able size. */}
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาเมนู ชื่อ หรือหมวดหมู่..."
          containerClassName="max-w-sm"
        />

        {typesPresent.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTypeChange(null)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                activeType === null
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              ทุกประเภท
            </button>
            {typesPresent.map((t) => {
              const Icon = TYPE_ICONS[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                    activeType === t
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        )}

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                activeCategory === null
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40"
              }`}
            >
              ทั้งหมด
            </button>
            {categories.map((c) => {
              const { color } = colorForCategory(c === "อื่นๆ" ? null : c);
              const isActive = activeCategory === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCategory(c)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all"
                  style={
                    isActive
                      ? { backgroundColor: color, borderColor: color, color: "white" }
                      : { borderColor: `color-mix(in oklab, ${color} 40%, transparent)` }
                  }
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: isActive ? "white" : color }}
                  />
                  {c}
                </button>
              );
            })}
          </div>
        )}

        {/* FR-POS-01: ปุ่มเมนูกดตรง ไม่ต้อง search ในการใช้งานปกติ — ตอนนี้เสริมด้วยช่องค้นหา/ตัวกรองประเภทด้านบน */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleMenus.map((menu) => (
            <PosMenuTile key={menu.id} menu={menu} onClick={() => handleMenuClick(menu)} />
          ))}
          {visibleMenus.length === 0 && (
            <p className="text-muted-foreground col-span-full py-10 text-center text-sm">
              ยังไม่มีเมนูพร้อมขาย
            </p>
          )}
        </div>
      </div>

      <CartPanel
        cart={cart}
        billDiscountAmount={billDiscountAmount}
        paymentMethod={paymentMethod}
        isCheckingOut={isCheckingOut}
        error={error}
        onUpdateQuantity={updateQuantity}
        onUpdateLineDiscount={updateLineDiscount}
        onRemoveLine={removeLine}
        onBillDiscountChange={setBillDiscountAmount}
        onPaymentMethodChange={setPaymentMethod}
        onCheckout={handleCheckout}
      />

      {modalMenu && (
        <VariantModifierModal
          menu={modalMenu}
          open={!!modalMenu}
          onClose={() => setModalMenu(null)}
          onConfirm={(selection) => addToCart(modalMenu, selection)}
        />
      )}

      {receipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setReceipt(null)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-xl p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-muted-foreground text-sm">ขายสำเร็จ</p>
            <p className="font-heading text-3xl font-bold">{formatBaht(receipt.totalAmount)}</p>
            {receipt.isStockDeficit && (
              <Badge variant="destructive" className="mt-2">
                มีวัตถุดิบสต็อกไม่พอ — ระบบขายต่อให้แล้ว
              </Badge>
            )}
            <a
              href={`/api/pos/receipts/${receipt.transactionId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border mt-4 block w-full rounded-lg border py-2 text-center text-sm font-medium"
            >
              ดูใบเสร็จ (PDF)
            </a>
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="bg-primary text-primary-foreground mt-2 w-full rounded-lg py-2 text-sm font-medium"
            >
              ขายต่อ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
