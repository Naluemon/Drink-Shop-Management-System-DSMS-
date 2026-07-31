"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  previewRecipeImport,
  commitRecipeImport,
  type PreviewRecipeResult,
} from "../actions/recipe-import-export";
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
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function RecipeImportDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewRecipeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalidRows, setInvalidRows] = useState<{ name: string; reason: string }[]>([]);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPreview(null);
    setError(null);
    setInvalidRows([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    setInvalidRows([]);
    startTransition(async () => {
      try {
        const fileBase64 = await fileToBase64(file);
        const result = await previewRecipeImport(fileBase64);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setPreview(result);
      } catch {
        setError("เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง");
      }
    });
  }

  function handleConfirm() {
    if (!preview || preview.toCreate.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await commitRecipeImport(preview.toCreate);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        if (result.invalidRows.length > 0) {
          toast.warning(
            `สร้างสูตร ${result.createdCount} รายการ (${result.invalidRows.length} รายการไม่สำเร็จ ดูรายละเอียดด้านล่าง)`,
          );
          setInvalidRows(result.invalidRows);
          router.refresh();
          return;
        }
        toast.success(`นำเข้าสำเร็จ ${result.createdCount} รายการ`);
        setOpen(false);
        reset();
        router.refresh();
      } catch {
        setError("เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง");
      }
    });
  }

  function handleAcknowledgeFailures() {
    setOpen(false);
    reset();
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
          <DialogTitle>นำเข้าสูตรจากไฟล์</DialogTitle>
          <DialogDescription>
            รองรับไฟล์ .xlsx และ .csv — 1 แถวต่อวัตถุดิบ 1 รายการในสูตร
            (แถวที่มีชื่อสูตรเดียวกันจะถูกรวมเป็นสูตรเดียว) ยังไม่มีไฟล์?{" "}
            <a href="/templates/recipes-import-template.xlsx" download className="underline">
              ดาวน์โหลดแม่แบบ Excel
            </a>{" "}
            หรือ{" "}
            <a href="/templates/recipes-import-template.csv" download className="underline">
              CSV
            </a>
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={handleFileChange}
          disabled={isPending}
        />

        {error && <p className="text-destructive text-sm">{error}</p>}

        {invalidRows.length > 0 && (
          <div className="space-y-2 text-sm">
            <p className="text-destructive font-medium">
              ข้ามไป {invalidRows.length} รายการ (ข้อมูลไม่ผ่านการตรวจสอบก่อนบันทึก)
            </p>
            <ul className="text-destructive list-inside list-disc">
              {invalidRows.map((f, i) => (
                <li key={i}>
                  {f.name}: {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {invalidRows.length === 0 && preview && (
          <div className="space-y-2 text-sm">
            <p>จะสร้างสูตรใหม่ {preview.toCreate.length} รายการ</p>
            {preview.duplicates.length > 0 && (
              <div>
                <p className="text-muted-foreground">
                  ข้าม {preview.duplicates.length} รายการ (ชื่อซ้ำกับที่มีอยู่แล้ว)
                </p>
                <ul className="text-muted-foreground list-inside list-disc">
                  {preview.duplicates.map((d) => (
                    <li key={d.name}>{d.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.errors.length > 0 && (
              <div>
                <p className="text-destructive">พบปัญหา {preview.errors.length} สูตร</p>
                <ul className="text-destructive list-inside list-disc">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      {e.recipeName} (แถวที่ {e.rowNumber}): {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {invalidRows.length > 0 ? (
            <Button type="button" onClick={handleAcknowledgeFailures}>
              ปิด
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!preview || preview.toCreate.length === 0 || isPending}
              onClick={handleConfirm}
            >
              ยืนยันนำเข้า
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
