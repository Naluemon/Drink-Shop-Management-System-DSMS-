export interface ReceiptItemModifier {
  name: string;
  priceDelta: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: string;
  modifiers: ReceiptItemModifier[];
}

export interface ReceiptData {
  company: {
    name: string;
    address: string | null;
    phone: string | null;
    taxId: string | null;
    isVatRegistered: boolean;
    footerMessage: string | null;
  };
  paperWidth: "mm58" | "mm80";
  transaction: {
    createdAt: string;
    paymentMethod: "cash" | "qr";
    taxInvoiceNumber: number | null;
    vatModeSnapshot: "inclusive" | "exclusive" | "none";
    vatRateSnapshot: string;
    subtotal: string;
    discountAmount: string;
    roundingAdjustment: string;
    totalAmount: string;
    isVoided: boolean;
    voidReason: string | null;
  };
  items: ReceiptItem[];
}

function baht(v: string | number): string {
  return `${Number(v).toFixed(2)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PAYMENT_LABELS: Record<ReceiptData["transaction"]["paymentMethod"], string> = {
  cash: "เงินสด",
  qr: "QR พร้อมเพย์",
};

// DECISIONS.md D16: a VAT-registered shop's receipt is a legal "ใบกำกับภาษี
// อย่างย่อ" and must carry the label, tax ID, and continuous invoice number;
// a non-registered shop just gets a normal receipt with none of that.
export function buildReceiptHtml(data: ReceiptData): string {
  const { company, transaction: t, items } = data;
  const width = data.paperWidth === "mm58" ? "58mm" : "80mm";
  const isVat = company.isVatRegistered && t.vatModeSnapshot !== "none";

  const itemRows = items
    .map((item) => {
      const modifierRows = item.modifiers
        .map(
          (m) =>
            `<div class="row modifier"><span>+ ${escapeHtml(m.name)}</span><span>${baht(m.priceDelta)}</span></div>`,
        )
        .join("");
      return `
        <div class="row item">
          <span>${escapeHtml(item.name)} x${item.quantity}</span>
          <span>${baht(item.unitPrice)}</span>
        </div>
        ${modifierRows}
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 4mm; }
  body {
    font-family: "Noto Sans Thai", "Sarabun", sans-serif;
    width: ${width};
    margin: 0;
    font-size: 11px;
    color: #111;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .muted { color: #555; }
  .divider { border-top: 1px dashed #333; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row.modifier { padding-left: 8px; color: #555; }
  .row.total { font-weight: 700; font-size: 13px; }
  .header { margin-bottom: 6px; }
  .void-banner {
    text-align: center;
    font-weight: 700;
    color: #b3261e;
    border: 1px solid #b3261e;
    padding: 3px;
    margin-bottom: 6px;
  }
</style>
</head>
<body>
  ${t.isVoided ? `<div class="void-banner">*** ใบเสร็จนี้ถูกยกเลิก ***</div>` : ""}

  <div class="header center">
    <div class="bold">${escapeHtml(company.name)}</div>
    ${company.address ? `<div class="muted">${escapeHtml(company.address)}</div>` : ""}
    ${company.phone ? `<div class="muted">โทร. ${escapeHtml(company.phone)}</div>` : ""}
  </div>

  ${
    isVat
      ? `<div class="center bold">ใบกำกับภาษีอย่างย่อ</div>
         <div class="center muted">เลขประจำตัวผู้เสียภาษี ${escapeHtml(company.taxId ?? "-")}</div>
         <div class="center muted">เลขที่ ${t.taxInvoiceNumber ?? "-"}</div>`
      : ""
  }

  <div class="divider"></div>

  <div class="row muted">
    <span>${new Date(t.createdAt).toLocaleString("th-TH")}</span>
    <span>${PAYMENT_LABELS[t.paymentMethod]}</span>
  </div>

  <div class="divider"></div>

  ${itemRows}

  <div class="divider"></div>

  <div class="row"><span>ยอดรวม</span><span>${baht(t.subtotal)}</span></div>
  ${Number(t.discountAmount) !== 0 ? `<div class="row"><span>ส่วนลด</span><span>-${baht(t.discountAmount)}</span></div>` : ""}
  ${Number(t.roundingAdjustment) !== 0 ? `<div class="row"><span>ปัดเศษ</span><span>${baht(t.roundingAdjustment)}</span></div>` : ""}
  ${
    isVat && t.vatModeSnapshot === "exclusive"
      ? `<div class="row muted"><span>VAT ${baht(t.vatRateSnapshot)}%</span><span></span></div>`
      : isVat
        ? `<div class="row muted"><span>(รวม VAT ${baht(t.vatRateSnapshot)}% แล้ว)</span><span></span></div>`
        : ""
  }

  <div class="divider"></div>

  <div class="row total"><span>ยอดสุทธิ</span><span>${baht(t.totalAmount)} บาท</span></div>

  ${company.footerMessage ? `<div class="divider"></div><div class="center muted">${escapeHtml(company.footerMessage)}</div>` : ""}
</body>
</html>`;
}
