import { notFound } from "next/navigation";
import { getSalesReportForPrint } from "@/features/reports/actions/reports";
import { verifyPrintToken } from "@/lib/print-token";
import { getOrCreateCompanySettings } from "@/lib/settings";

const GRANULARITY_LABELS: Record<string, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
  yearly: "รายปี",
};

function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// DECISIONS.md D10: rendered by our own headless-Chromium PDF export
// (features/reports/actions/reports.ts's exportSalesReportPdf) — never meant
// to be opened directly by a user. Auth is a short-lived signed token
// (lib/print-token.ts), not a session cookie, since the headless browser has
// no login session. This is the only route excluded from proxy.ts's default
// session check for that reason.
export default async function SalesReportPrintPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const granularity = searchParams?.granularity as string | undefined;
  const from = searchParams?.from as string | undefined;
  const to = searchParams?.to as string | undefined;
  const token = searchParams?.token as string | undefined;

  if (!granularity || !from || !to || !token) {
    notFound();
  }

  const expectedPayload = new URLSearchParams({ granularity, from, to }).toString();
  if (!verifyPrintToken(token, expectedPayload)) {
    notFound();
  }

  const [reportResult, companySettings] = await Promise.all([
    getSalesReportForPrint({
      granularity: granularity as "daily" | "weekly" | "monthly" | "yearly",
      from,
      to,
    }),
    getOrCreateCompanySettings(),
  ]);

  if ("error" in reportResult) {
    notFound();
  }

  const { rows, totals } = reportResult;
  const companyName = companySettings.registeredName || "ระบบจัดการร้านเครื่องดื่ม (DSMS)";
  const generatedAt = new Date().toLocaleString("th-TH", { timeZone: companySettings.timezone });

  return (
    <div className="min-h-screen bg-white p-10 text-neutral-900">
      <header className="mb-8 border-b border-neutral-300 pb-4">
        <h1 className="font-heading text-2xl font-semibold">{companyName}</h1>
        <p className="mt-1 text-lg">
          รายงานยอดขาย ({GRANULARITY_LABELS[granularity] ?? granularity})
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          ช่วงวันที่ {from} ถึง {to} — พิมพ์เมื่อ {generatedAt}
        </p>
      </header>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-left">
            <th className="py-2 pr-4">ช่วงเวลา</th>
            <th className="py-2 pr-4 text-right">จำนวนบิล</th>
            <th className="py-2 text-right">รายได้ (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-neutral-200">
              <td className="py-1.5 pr-4">{r.label}</td>
              <td className="py-1.5 pr-4 text-right">{r.transactionCount}</td>
              <td className="py-1.5 text-right">{formatBaht(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-800 font-semibold">
            <td className="py-2 pr-4">รวมทั้งหมด</td>
            <td className="py-2 pr-4 text-right">{totals.transactionCount}</td>
            <td className="py-2 text-right">{formatBaht(totals.revenue)}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="mt-10 text-xs text-neutral-400">
        ตัวเลขคำนวณโดยตรงจาก sales_transactions ทุกครั้งที่สร้างรายงาน (ไม่มีข้อมูลสรุปแยกต่างหาก) —
        นับตามวันทางธุรกิจ (business day), หัก void/refund ที่เกิดขึ้นแล้วโดยอัตโนมัติ
      </footer>
    </div>
  );
}
