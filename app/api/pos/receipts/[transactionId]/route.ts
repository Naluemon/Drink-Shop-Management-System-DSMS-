import { NextResponse } from "next/server";
import { getReceiptData } from "@/features/pos/actions/receipt";
import { buildReceiptHtml } from "@/features/pos/lib/receipt-html";
import { renderHtmlToPdf } from "@/lib/pdf";

// DECISIONS.md D10/D16 — receipt PDF, rendered server-side via headless
// Chromium so Thai text shaping is correct and the file is a real download/
// print target rather than only an on-screen summary.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const { transactionId } = await params;

  const result = await getReceiptData(transactionId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const html = buildReceiptHtml(result.data);
  const width = result.data.paperWidth === "mm58" ? "58mm" : "80mm";
  const pdf = await renderHtmlToPdf(html, width);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${transactionId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
