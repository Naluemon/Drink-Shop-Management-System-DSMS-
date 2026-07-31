"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  previewIngredientImport,
  commitIngredientImport,
  type PreviewResult,
} from "../actions/ingredient-import-export";
import type { ParsedIngredientRow } from "../lib/validate-import";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>" — keep only the data part.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function IngredientImportDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const fileBase64 = await fileToBase64(file);
      const result = await previewIngredientImport(fileBase64);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPreview(result);
    });
  }

  function handleConfirm() {
    if (!preview || preview.toCreate.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await commitIngredientImport(preview.toCreate);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`นำเข้าสำเร็จ ${result.createdCount} รายการ`);
      // createdCount only counts rows whose Ingredient row (and starting-stock
      // ledger movement, if any) both succeeded. A row can create the
      // Ingredient but still fail to record its starting stock (see the
      // comment above recordStockIn's call site in ingredient-import-export.ts)
      // — surface that separately so a shop owner doesn't assume "success
      // toast" means every ingredient's starting stock was actually recorded.
      if (result.stockInFailures.length > 0) {
        toast.warning(
          `มี ${result.stockInFailures.length} รายการที่สร้างวัตถุดิบสำเร็จ แต่บันทึกสต็อกเริ่มต้นไม่สำเร็จ: ${result.stockInFailures
            .map((f) => `แถวที่ ${f.rowNumber} (${f.name}): ${f.reason}`)
            .join(", ")}`,
        );
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Upload /> นำเข้าไฟล์
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>นำเข้าวัตถุดิบจากไฟล์</DialogTitle>
          <DialogDescription>รองรับไฟล์ .xlsx และ .csv ตามผังคอลัมน์ของแม่แบบ</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={handleFileChange}
          disabled={isPending}
        />

        {error && <p className="text-destructive text-sm">{error}</p>}

        {preview && (
          <div className="space-y-2 text-sm">
            <p>จะสร้างวัตถุดิบใหม่ {preview.toCreate.length} รายการ</p>
            {preview.duplicates.length > 0 && (
              <div>
                <p className="text-muted-foreground">
                  ข้าม {preview.duplicates.length} รายการ (ชื่อซ้ำกับที่มีอยู่แล้ว)
                </p>
                <ul className="text-muted-foreground list-inside list-disc">
                  {preview.duplicates.map((d) => (
                    <li key={d.rowNumber}>
                      แถวที่ {d.rowNumber}: {d.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.errors.length > 0 && (
              <div>
                <p className="text-destructive">พบปัญหา {preview.errors.length} แถว</p>
                <ul className="text-destructive list-inside list-disc">
                  {preview.errors.map((e) => (
                    <li key={e.rowNumber}>
                      แถวที่ {e.rowNumber}: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            disabled={!preview || preview.toCreate.length === 0 || isPending}
            onClick={handleConfirm}
          >
            ยืนยันนำเข้า
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
