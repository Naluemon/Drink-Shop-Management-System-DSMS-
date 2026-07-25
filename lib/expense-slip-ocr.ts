import { createWorker } from "tesseract.js";

export interface SlipExtraction {
  amount: number | null;
}

const AMOUNT_KEYWORDS = ["จำนวนเงิน", "จำนวน", "ยอดเงิน", "ยอดโอน", "amount", "บาท", "thb"];
const NUMBER_PATTERN = /\d{1,3}(?:,\d{3})*\.\d{2}/g;

// Best-effort, free/local parsing of raw OCR text — no LLM understanding of
// the layout, so this only ever looks for a decimal amount. Prefers a number
// on a line with an amount-ish keyword (most bank slips label the transfer
// total this way); falls back to the largest decimal number found, since fee
// lines tend to be smaller than the actual transfer amount.
export function parseSlipText(text: string): SlipExtraction {
  const lines = text.split("\n");

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (AMOUNT_KEYWORDS.some((k) => lower.includes(k))) {
      const matches = line.match(NUMBER_PATTERN);
      if (matches?.length) {
        return { amount: parseFloat(matches[matches.length - 1].replace(/,/g, "")) };
      }
    }
  }

  const allMatches = text.match(NUMBER_PATTERN);
  if (!allMatches?.length) return { amount: null };
  const values = allMatches.map((m) => parseFloat(m.replace(/,/g, "")));
  return { amount: Math.max(...values) };
}

// Convenience feature only — never blocks the create-expense flow. Category
// still can't be inferred (it's a business classification, not printed on
// the slip), and free-text "note" extraction is too unreliable from raw OCR
// text to auto-fill safely, so this only ever suggests an amount; the user
// always reviews it before saving.
export async function extractSlipData(
  file: File,
): Promise<{ data: SlipExtraction } | { error: string }> {
  if (file.type === "application/pdf") {
    return { error: "อ่านข้อมูลอัตโนมัติได้เฉพาะไฟล์รูปภาพ (PDF กรุณากรอกจำนวนเงินเอง)" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const worker = await createWorker(["eng", "tha"]);
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    const result = parseSlipText(text);
    if (result.amount == null) {
      return { error: "อ่านจำนวนเงินจากสลิปไม่สำเร็จ กรุณากรอกเอง" };
    }
    return { data: result };
  } catch {
    return { error: "อ่านข้อมูลจากสลิปไม่สำเร็จ กรุณากรอกเอง" };
  } finally {
    await worker.terminate();
  }
}
