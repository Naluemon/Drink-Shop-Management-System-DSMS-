"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  updateCompanyInfo,
  updateTaxSettings,
  updateReceiptSettings,
  updateBusinessHours,
  updateStockDeficitPolicy,
} from "../actions/company-settings";
import { ReasonCodeManager, type ReasonCodeRow } from "./reason-code-manager";
import {
  IngredientDeficitOverrides,
  type IngredientOverrideRow,
} from "./ingredient-deficit-overrides";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CompanySettingsData {
  registeredName: string;
  registeredAddress: string;
  companyPhone: string;
  isVatRegistered: boolean;
  taxId: string;
  receiptFooterMessage: string;
  receiptPaperWidth: "mm58" | "mm80";
  openTime: string;
  closeTime: string;
  timezone: string;
  businessDayStartHour: number;
  stockDeficitPolicy: "warn_only" | "strict_block";
}

export interface TaxSettingsData {
  vatMode: "inclusive" | "exclusive" | "none";
  vatRate: string;
}

interface SettingsPageContentProps {
  companySettings: CompanySettingsData;
  taxSettings: TaxSettingsData;
  ingredients: IngredientOverrideRow[];
  reasonCodes: ReasonCodeRow[];
}

function SavedNote({ savedAt }: { savedAt: number | null }) {
  if (!savedAt) return null;
  return <p className="text-accent text-xs">บันทึกสำเร็จ</p>;
}

function CompanyInfoSection({ initial }: { initial: CompanySettingsData }) {
  const [registeredName, setRegisteredName] = useState(initial.registeredName);
  const [registeredAddress, setRegisteredAddress] = useState(initial.registeredAddress);
  const [companyPhone, setCompanyPhone] = useState(initial.companyPhone);
  const [isVatRegistered, setIsVatRegistered] = useState(initial.isVatRegistered);
  const [taxId, setTaxId] = useState(initial.taxId);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateCompanyInfo({
        registeredName,
        registeredAddress,
        companyPhone,
        isVatRegistered,
        taxId,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      toast.success("บันทึกสำเร็จ");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ข้อมูลร้าน / ใบกำกับภาษี</CardTitle>
        <CardDescription>
          ชื่อ/ที่อยู่นี้แสดงบนใบเสร็จทุกใบ — ถ้าจดทะเบียน VAT จะแสดงเป็น
          &quot;ใบกำกับภาษีอย่างย่อ&quot; (D16)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">ชื่อร้าน</Label>
              <Input value={registeredName} onChange={(e) => setRegisteredName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">เบอร์โทร</Label>
              <Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ที่อยู่</Label>
            <Input
              value={registeredAddress}
              onChange={(e) => setRegisteredAddress(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isVatRegistered}
              onChange={(e) => setIsVatRegistered(e.target.checked)}
            />
            จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)
          </label>
          {isVatRegistered && (
            <div className="space-y-1">
              <Label className="text-xs">เลขประจำตัวผู้เสียภาษี (13 หลัก)</Label>
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={13} />
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              บันทึก
            </Button>
            <SavedNote savedAt={savedAt} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const VAT_MODE_LABELS: Record<string, string> = {
  inclusive: "รวมในราคาสินค้า (Inclusive)",
  exclusive: "แยกจากราคาสินค้า (Exclusive)",
  none: "ไม่คิด VAT",
};

function TaxSection({ initial }: { initial: TaxSettingsData }) {
  const [vatMode, setVatMode] = useState(initial.vatMode);
  const [vatRate, setVatRate] = useState(initial.vatRate);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateTaxSettings({ vatMode, vatRate: Number(vatRate) });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      toast.success("บันทึกสำเร็จ");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ภาษีมูลค่าเพิ่ม (VAT)</CardTitle>
        <CardDescription>
          มีผลกับใบเสร็จที่ออกใหม่ทันที ไม่กระทบใบเสร็จเก่า (เป็น snapshot ต่อรายการ, D9)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">รูปแบบ VAT</Label>
              <Select
                value={vatMode}
                onValueChange={(v) => setVatMode((v ?? "inclusive") as typeof vatMode)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกรูปแบบ">
                    {(v: string) => VAT_MODE_LABELS[v] ?? v}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inclusive">{VAT_MODE_LABELS.inclusive}</SelectItem>
                  <SelectItem value="exclusive">{VAT_MODE_LABELS.exclusive}</SelectItem>
                  <SelectItem value="none">{VAT_MODE_LABELS.none}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">อัตรา VAT (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              บันทึก
            </Button>
            <SavedNote savedAt={savedAt} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const PAPER_WIDTH_LABELS: Record<string, string> = { mm58: "58 มม.", mm80: "80 มม." };

function ReceiptSection({ initial }: { initial: CompanySettingsData }) {
  const [receiptFooterMessage, setReceiptFooterMessage] = useState(initial.receiptFooterMessage);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState(initial.receiptPaperWidth);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateReceiptSettings({ receiptFooterMessage, receiptPaperWidth });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      toast.success("บันทึกสำเร็จ");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ใบเสร็จ / เครื่องพิมพ์</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="space-y-1">
            <Label className="text-xs">ข้อความท้ายใบเสร็จ</Label>
            <Input
              value={receiptFooterMessage}
              onChange={(e) => setReceiptFooterMessage(e.target.value)}
              placeholder="ขอบคุณที่ใช้บริการ"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ขนาดกระดาษ (เครื่องพิมพ์ใบเสร็จ)</Label>
            <Select
              value={receiptPaperWidth}
              onValueChange={(v) => setReceiptPaperWidth((v ?? "mm80") as typeof receiptPaperWidth)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="เลือกขนาด">
                  {(v: string) => PAPER_WIDTH_LABELS[v] ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mm58">{PAPER_WIDTH_LABELS.mm58}</SelectItem>
                <SelectItem value="mm80">{PAPER_WIDTH_LABELS.mm80}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              บันทึก
            </Button>
            <SavedNote savedAt={savedAt} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BusinessHoursSection({ initial }: { initial: CompanySettingsData }) {
  const [openTime, setOpenTime] = useState(initial.openTime);
  const [closeTime, setCloseTime] = useState(initial.closeTime);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [businessDayStartHour, setBusinessDayStartHour] = useState(
    String(initial.businessDayStartHour),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateBusinessHours({
        openTime,
        closeTime,
        timezone,
        businessDayStartHour: Number(businessDayStartHour),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      toast.success("บันทึกสำเร็จ");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">เวลาทำการ / Timezone</CardTitle>
        <CardDescription>
          &quot;เวลาเริ่มวันทางธุรกิจ&quot;
          ใช้กำหนดว่ายอดขายหลังเที่ยงคืนนับเป็นของเมื่อวานจนถึงชั่วโมงนี้ (D8) — มีผลกับ
          Dashboard/Report/POS Void ทันที
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">เวลาเปิดร้าน</Label>
              <Input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">เวลาปิดร้าน</Label>
              <Input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Timezone (IANA)</Label>
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Asia/Bangkok"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">เวลาเริ่มวันทางธุรกิจ (0-23)</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={businessDayStartHour}
                onChange={(e) => setBusinessDayStartHour(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              บันทึก
            </Button>
            <SavedNote savedAt={savedAt} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const DEFICIT_POLICY_LABELS: Record<string, string> = {
  warn_only: "เตือนเท่านั้น (ค่าเริ่มต้น) — ขายต่อได้ สต็อกติดลบชั่วคราวได้",
  strict_block: "บล็อกเข้มงวด — ห้ามขาย/ตัดสต็อกถ้าไม่พอ",
};

function StockDeficitPolicySection({
  initial,
  ingredients,
}: {
  initial: CompanySettingsData;
  ingredients: IngredientOverrideRow[];
}) {
  const [policy, setPolicy] = useState(initial.stockDeficitPolicy);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateStockDeficitPolicy({ stockDeficitPolicy: policy });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      toast.success("บันทึกสำเร็จ");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">นโยบายเมื่อสต็อกไม่พอ</CardTitle>
        <CardDescription>
          ค่าเริ่มต้นของร้าน (DECISIONS.md D4) — ปรับเฉพาะวัตถุดิบได้ด้านล่าง
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Select
            value={policy}
            onValueChange={(v) => setPolicy((v ?? "warn_only") as typeof policy)}
          >
            <SelectTrigger className="w-full sm:w-96">
              <SelectValue placeholder="เลือกนโยบาย">
                {(v: string) => DEFICIT_POLICY_LABELS[v] ?? v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="warn_only">{DEFICIT_POLICY_LABELS.warn_only}</SelectItem>
              <SelectItem value="strict_block">{DEFICIT_POLICY_LABELS.strict_block}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              บันทึก
            </Button>
            <SavedNote savedAt={savedAt} />
          </div>
        </form>

        <div>
          <h3 className="font-heading text-foreground mb-2 text-sm font-semibold">
            ปรับเฉพาะรายวัตถุดิบ
          </h3>
          <IngredientDeficitOverrides ingredients={ingredients} />
        </div>
      </CardContent>
    </Card>
  );
}

// Phase 12 — Settings. Owner-only (SECURITY.md §1). Refund approval threshold
// (D5/D14, Phase 2) stays in its own server-rendered form in app/settings/page.tsx.
export function SettingsPageContent({
  companySettings,
  taxSettings,
  ingredients,
  reasonCodes,
}: SettingsPageContentProps) {
  return (
    <div className="space-y-6">
      <CompanyInfoSection initial={companySettings} />
      <TaxSection initial={taxSettings} />
      <ReceiptSection initial={companySettings} />
      <BusinessHoursSection initial={companySettings} />
      <StockDeficitPolicySection initial={companySettings} ingredients={ingredients} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">รายการเหตุผล (Stock Out)</CardTitle>
          <CardDescription>ใช้เมื่อพนักงานตัดสต็อกออกแบบมีเอกสารอ้างอิง (D12)</CardDescription>
        </CardHeader>
        <CardContent>
          <ReasonCodeManager initialCodes={reasonCodes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ธีม</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
