// DECISIONS.md D10: render HTML→PDF via a real headless Chromium instead of a
// programmatic PDF library (react-pdf, pdf-lib, ...) — those don't reliably
// shape Thai script (สระ/วรรณยุกต์ positioning), while a real browser engine
// renders Thai exactly as it already appears on-screen. Dev uses full
// `puppeteer` (bundles its own Chromium, works cross-platform); production
// uses `puppeteer-core` + `@sparticuz/chromium` (a serverless-sized binary —
// see DEPLOYMENT.md §2.1). Both expose the same page.pdf()/setContent() API,
// so only this narrow interface is depended on, not either package's full types.
interface PdfPage {
  setContent(html: string, options?: { waitUntil?: "networkidle0" }): Promise<void>;
  pdf(options: { width?: string; printBackground?: boolean }): Promise<Buffer>;
}

interface PdfBrowser {
  newPage(): Promise<PdfPage>;
  close(): Promise<void>;
}

async function launchBrowser(): Promise<PdfBrowser> {
  if (process.env.NODE_ENV === "production") {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    return browser as unknown as PdfBrowser;
  }

  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true });
  return browser as unknown as PdfBrowser;
}

export async function renderHtmlToPdf(html: string, width = "80mm"): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ width, printBackground: true });
  } finally {
    await browser.close();
  }
}
