// DECISIONS.md D15: PDPA Compliance - Privacy Notice
// แสดงตอนรับ invite ครั้งแรก หรือตอนแก้ไขข้อมูลส่วนตัว

"use client";

import { useState } from "react";

interface PrivacyNoticeProps {
  onAccept: () => void;
  showCheckbox?: boolean;
}

export function PrivacyNotice({ onAccept, showCheckbox = true }: PrivacyNoticeProps) {
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    if (!showCheckbox || accepted) {
      onAccept();
    }
  };

  return (
    <div className="border-border bg-muted/50 rounded-lg border p-4">
      <h3 className="font-heading text-foreground mb-2 text-sm font-semibold">
        นโยบายความเป็นส่วนตัว (PDPA)
      </h3>
      <div className="text-muted-foreground mb-3 space-y-2 text-xs">
        <p>
          บริษัทจะเก็บข้อมูลส่วนบุคคลของคุณ (ชื่อ, อีเมล, ประวัติการใช้งานระบบ)
          เพื่อวัตถุประสงค์ในการบริหารจัดการระบบและปฏิบัติตามสัญญาการใช้งาน
        </p>
        <p className="text-foreground">
          <strong>สิทธิของคุณตามพ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล:</strong>
        </p>
        <ul className="ml-2 list-inside list-disc space-y-1">
          <li>ขอเข้าถึงข้อมูลส่วนบุคคลของคุณ</li>
          <li>ขอแก้ไขข้อมูลส่วนบุคคลของคุณ</li>
          <li>ขอให้ลบข้อมูลส่วนบุคคลของคุณ (เมื่อพ้นสภาพพนักงาน)</li>
          <li>ขอรับสำเนาข้อมูลส่วนบุคคลของคุณ</li>
          <li>ขอคัดค้านหรือขอให้ระงับการประมวลผลข้อมูล</li>
        </ul>
        <p className="text-xs">
          หากมีข้อสงสัยเกี่ยวกับการใช้ข้อมูลส่วนบุคคล สามารถติดต่อเจ้าของระบบได้
        </p>
      </div>

      {showCheckbox && (
        <label className="flex cursor-pointer items-start space-x-2">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="text-primary border-input focus:ring-ring mt-0.5 h-4 w-4 rounded"
          />
          <span className="text-foreground text-xs">
            ข้าพเจ้าได้อ่านและเข้าใจนโยบายความเป็นส่วนตัว
            และยินยอมให้บริษัทเก็บและใช้ข้อมูลส่วนบุคคลของข้าพเจ้าตามวัตถุประสงค์ที่ระบุ
          </span>
        </label>
      )}

      <button
        onClick={handleAccept}
        disabled={showCheckbox && !accepted}
        className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground mt-3 w-full rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
      >
        {showCheckbox ? "ยอมรับและดำเนินการต่อ" : "เข้าใจและดำเนินการต่อ"}
      </button>
    </div>
  );
}
