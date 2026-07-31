export interface ExpiringSoonItem {
  name: string;
  daysRemaining: number;
}

function urgencyColor(days: number): string {
  return days <= 0 ? "var(--destructive)" : "var(--chart-4)";
}

// "Simple" shelf-life-after-opening tracking (features/ingredients — an
// ingredient marked opened via markIngredientOpened() counts down from its
// configured shelfLifeDaysAfterOpening). Distinct from running-out-of-stock:
// this is about freshness after opening, not quantity on hand.
export function ExpiringSoonList({ items }: { items: ExpiringSoonItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">ยังไม่มีวัตถุดิบที่เปิดใช้แล้วใกล้หมดอายุ</p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const color = urgencyColor(item.daysRemaining);
        return (
          <li
            key={item.name}
            className="bg-muted/40 flex items-center justify-between rounded-md border-l-4 px-3 py-1.5 text-sm"
            style={{ borderLeftColor: color }}
          >
            <span className="font-medium">{item.name}</span>
            <span className="font-semibold" style={{ color }}>
              {item.daysRemaining < 0
                ? `หมดอายุแล้ว ${Math.abs(item.daysRemaining)} วัน — ควรทิ้ง`
                : item.daysRemaining === 0
                  ? "หมดอายุวันนี้"
                  : `เหลือ ${item.daysRemaining} วัน`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
