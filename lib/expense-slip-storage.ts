import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "expense-slips";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// Private bucket (not public) — slips are financial documents, viewed only
// through short-lived signed URLs (getExpenseSlipSignedUrl), never a public
// path. Created lazily on first upload rather than requiring a manual
// Supabase Dashboard step, same "getOrCreate" pattern as
// lib/default-branch.ts / getOrCreateCompanySettings.
async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: existing } = await admin.storage.getBucket(BUCKET);
  if (existing) return;
  await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_SIZE_BYTES });
}

export async function uploadExpenseSlip(
  file: File,
  branchId: string,
): Promise<{ path: string; error?: undefined } | { path?: undefined; error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "ไฟล์สลิปต้องเป็นรูปภาพ (JPEG/PNG/WebP) หรือ PDF เท่านั้น" };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { error: "ไฟล์สลิปต้องมีขนาดไม่เกิน 5MB" };
  }

  const admin = createAdminClient();
  await ensureBucket(admin);

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${branchId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) return { error: `อัปโหลดสลิปไม่สำเร็จ: ${error.message}` };

  return { path };
}

// 60s expiry — long enough for the browser to open the tab and load the
// file, short enough that a copied link doesn't stay valid indefinitely.
export async function getExpenseSlipSignedUrl(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) return null;
  return data.signedUrl;
}
