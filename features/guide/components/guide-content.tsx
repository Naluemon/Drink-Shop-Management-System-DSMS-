import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

function Step({ children }: { children: ReactNode }) {
  return <li className="marker:text-muted-foreground/60">{children}</li>;
}

function StepList({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>;
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="bg-muted/60 text-muted-foreground rounded-lg border border-dashed p-2.5 text-xs">
      {children}
    </p>
  );
}

const SECTIONS: Section[] = [
  {
    id: "login",
    title: "เข้าสู่ระบบและโปรไฟล์",
    body: (
      <>
        <StepList>
          <Step>
            เข้าสู่ระบบด้วยอีเมล/รหัสผ่าน หรือกด &quot;เข้าสู่ระบบด้วย Google&quot; ที่หน้า Login
          </Step>
          <Step>
            ลืมรหัสผ่าน กด &quot;ลืมรหัสผ่าน?&quot; กรอกอีเมล ระบบจะส่งลิงก์รีเซ็ตให้ทางอีเมล
          </Step>
          <Step>
            แก้ไขชื่อ/อีเมล หรือเปลี่ยนรหัสผ่านของตัวเอง ทำได้ที่มุมล่างซ้าย คลิกชื่อของคุณ →
            &quot;โปรไฟล์ของฉัน&quot;
          </Step>
        </StepList>
        <Note>
          บัญชีใหม่ทุกคนต้องได้รับคำเชิญ (invite) จากเจ้าของร้านหรือผู้จัดการก่อนเท่านั้น
          สมัครเองไม่ได้
        </Note>
      </>
    ),
  },
  {
    id: "dashboard",
    title: "แดชบอร์ด",
    body: (
      <>
        <p>
          หน้าแรกหลังเข้าสู่ระบบ (เจ้าของร้าน/ผู้จัดการ/หัวหน้ากะ)
          สรุปภาพรวมร้านวันนี้เทียบกับเมื่อวาน:
        </p>
        <StepList>
          <Step>
            การ์ดตัวเลขด้านบน — ยอดขาย, รายได้, กำไรขั้นต้น, ค่าใช้จ่าย, กำไรสุทธิ
            (มีสีกำกับแต่ละตัวให้จำได้ง่าย)
          </Step>
          <Step>
            กราฟ &quot;แนวโน้ม&quot; — เลือกช่วงเวลาดูได้ที่มุมขวาบนของกราฟ (7 วัน, 30 วัน, ไตรมาส,
            6/9/12 เดือน)
          </Step>
          <Step>
            &quot;สัดส่วนรายได้วันนี้&quot; —
            ดูว่ารายได้วันนี้ถูกหักเป็นต้นทุนวัตถุดิบ/ค่าใช้จ่าย/กำไรสุทธิเท่าไหร่
          </Step>
          <Step>&quot;เมนูขายดี&quot; — จัดอันดับเมนูที่ขายดีที่สุดของวันนี้</Step>
        </StepList>
      </>
    ),
  },
  {
    id: "pos",
    title: "ขายหน้าร้าน (POS)",
    body: (
      <>
        <StepList>
          <Step>
            กดปุ่มเมนูที่ต้องการขาย — ถ้ามีขนาด/ตัวเลือกเสริม
            ระบบจะเด้งหน้าต่างให้เลือกก่อนใส่ตะกร้า
          </Step>
          <Step>ปรับจำนวน/ส่วนลดต่อรายการ หรือส่วนลดท้ายบิลได้ในตะกร้าฝั่งขวา</Step>
          <Step>เลือกวิธีชำระเงิน (เงินสด/QR) แล้วกด &quot;ยืนยันการขาย&quot;</Step>
          <Step>
            ขายสำเร็จจะขึ้นยอดเงินให้ทันที — กด &quot;ดูใบเสร็จ (PDF)&quot; เพื่อพิมพ์/บันทึกใบเสร็จ
          </Step>
          <Step>
            ยกเลิกรายการที่เพิ่งขายในกะเดียวกัน กดปุ่ม &quot;ยกเลิก (Void)&quot;
            ที่รายการนั้นในตาราง &quot;รายการขายล่าสุด&quot; แล้วใส่เหตุผล
          </Step>
        </StepList>
        <Note>
          ถ้าวัตถุดิบไม่พอ ระบบจะเตือนแต่ยังขายต่อให้ (ค่าเริ่มต้น) — เว้นแต่เจ้าของร้านตั้งค่าเป็น
          &quot;บล็อกเข้มงวด&quot; ไว้ในหน้าตั้งค่าระบบ
        </Note>
      </>
    ),
  },
  {
    id: "refunds",
    title: "คืนเงิน (ข้ามกะ)",
    body: (
      <StepList>
        <Step>
          ถ้าลูกค้าขอคืนเงินหลังจากปิดกะไปแล้ว แคชเชียร์ต้อง &quot;ขอคืนเงิน&quot; (ไม่ใช่ Void
          ธรรมดา)
        </Step>
        <Step>คำขอจะไปรออนุมัติที่เมนู &quot;อนุมัติคืนเงิน&quot;</Step>
        <Step>
          หัวหน้ากะอนุมัติได้เองถ้ายอดไม่เกินเพดานที่ตั้งไว้ (ดูที่ตั้งค่าระบบ)
          ถ้าเกินเพดานต้องให้ผู้จัดการ/เจ้าของร้านอนุมัติแทน
        </Step>
      </StepList>
    ),
  },
  {
    id: "ingredients",
    title: "วัตถุดิบ",
    body: (
      <StepList>
        <Step>
          กด &quot;เพิ่มวัตถุดิบ&quot; ใส่ชื่อ หน่วยฐาน (กรัม/มล./ชิ้น)
          และหน่วยซื้อจริงพร้อมอัตราแปลงหน่วย
        </Step>
        <Step>
          ตั้ง &quot;จุดสั่งซื้อขั้นต่ำ&quot; (low stock threshold) เพื่อให้ระบบเตือนตอนของใกล้หมด
        </Step>
        <Step>
          ต้นทุนต่อหน่วยคำนวณอัตโนมัติจากราคาที่รับเข้าจริงตอนทำใบสั่งซื้อ
          (ไม่ต้องกรอกมือหลังจากตั้งค่าครั้งแรก)
        </Step>
      </StepList>
    ),
  },
  {
    id: "recipes",
    title: "สูตร",
    body: (
      <StepList>
        <Step>สร้างสูตรโดยระบุวัตถุดิบและปริมาณที่ใช้ต่อ 1 หน่วยผลผลิต (yield)</Step>
        <Step>ต้นทุนของสูตรคำนวณให้อัตโนมัติ และจะอัปเดตทันทีถ้าต้นทุนวัตถุดิบเปลี่ยน</Step>
      </StepList>
    ),
  },
  {
    id: "menus",
    title: "เมนูและกลุ่มตัวเลือก",
    body: (
      <StepList>
        <Step>ผูกเมนูกับสูตร ตั้งราคาขาย และเพิ่มรูปภาพได้</Step>
        <Step>เพิ่มขนาด (variant) เช่น S/M/L โดยปรับสัดส่วนวัตถุดิบและราคาต่างจากขนาดหลัก</Step>
        <Step>
          สร้าง &quot;กลุ่มตัวเลือก&quot; (เช่น ท็อปปิ้ง) แล้วผูกเข้ากับเมนูที่ต้องการ —
          ราคา/ต้นทุนของตัวเลือกจะรวมเข้าไปในบิลอัตโนมัติ
        </Step>
      </StepList>
    ),
  },
  {
    id: "inventory",
    title: "สต็อก",
    body: (
      <StepList>
        <Step>สต็อกจะลดอัตโนมัติทุกครั้งที่มีการขาย ไม่ต้องตัดสต็อกมือ</Step>
        <Step>
          รับของเข้า (Stock In) หรือปรับสต็อกออกกรณีของเสีย/หมดอายุ (Stock Out)
          พร้อมระบุเหตุผลทุกครั้ง
        </Step>
        <Step>ธนาคาร/แถบสีแดงบนหน้าแดชบอร์ดจะขึ้นเตือนอัตโนมัติเมื่อวัตถุดิบใกล้หมด</Step>
      </StepList>
    ),
  },
  {
    id: "purchases",
    title: "ผู้จำหน่ายและใบสั่งซื้อ",
    body: (
      <StepList>
        <Step>เพิ่มรายชื่อผู้จำหน่ายที่หน้า &quot;ผู้จำหน่าย&quot; ก่อน</Step>
        <Step>สร้างใบสั่งซื้อ ระบุวัตถุดิบ จำนวน และราคาต่อหน่วยที่ซื้อจริง</Step>
        <Step>
          เมื่อของมาถึง กด &quot;รับของ&quot; — ระบบจะเพิ่มสต็อกและคำนวณต้นทุนเฉลี่ยถ่วงน้ำหนัก
          (WAC) ให้อัตโนมัติ
        </Step>
        <Step>
          สั่งผิดหรือผู้จำหน่ายยกเลิก กด &quot;ยกเลิก&quot; ที่ใบสั่งซื้อนั้นได้ก่อนรับของ
        </Step>
      </StepList>
    ),
  },
  {
    id: "expenses",
    title: "ค่าใช้จ่าย",
    body: (
      <StepList>
        <Step>
          กด &quot;บันทึกค่าใช้จ่าย&quot; เลือกหมวดหมู่ (ค่าเช่า/ค่าไฟ/เงินเดือน ฯลฯ)
          และใส่จำนวนเงิน
        </Step>
        <Step>
          แนบรูปสลิปโอนเงินได้ — ระบบจะลองอ่านจำนวนเงินจากรูปให้อัตโนมัติ (เฉพาะไฟล์รูปภาพ
          ยังไม่รองรับ PDF) แต่ควรตรวจสอบตัวเลขก่อนกดบันทึกเสมอ
        </Step>
        <Step>
          รายการที่บันทึกไปแล้วแก้ไข/ลบไม่ได้ (กันแก้ย้อนหลัง) — ถ้ากรอกผิดต้องสร้าง
          &quot;รายการปรับปรุง&quot; ใหม่แทน
        </Step>
      </StepList>
    ),
  },
  {
    id: "reports",
    title: "รายงาน",
    body: (
      <StepList>
        <Step>เลือกช่วงวันที่ แล้วดูรายงานยอดขาย, กำไร-ขาดทุน, ค่าใช้จ่าย, หรือเมนูขายดี</Step>
        <Step>กดปุ่ม &quot;CSV&quot; เพื่อดาวน์โหลดไฟล์ตัวเลขไปเปิดใน Excel</Step>
        <Step>รายงานยอดขายมีปุ่ม &quot;PDF&quot; สำหรับพิมพ์/แนบยื่นภาษีได้โดยตรง</Step>
        <Step>ฝ่ายบัญชี (Accountant) เห็นเฉพาะรายงานด้านการเงิน ไม่เห็นเมนู POS/สต็อก</Step>
      </StepList>
    ),
  },
  {
    id: "settings",
    title: "ตั้งค่าระบบ",
    body: (
      <>
        <p>เจ้าของร้านเท่านั้นที่เข้าหน้านี้ได้ ตั้งค่าที่มีผลกับทั้งระบบ:</p>
        <StepList>
          <Step>ข้อมูลร้าน, ภาษี (VAT), ที่อยู่/เลขผู้เสียภาษีสำหรับพิมพ์บนใบเสร็จ</Step>
          <Step>
            เวลาทำการ และ &quot;ชั่วโมงเริ่มวันทางธุรกิจ&quot; (ใช้กำหนดว่ายอดขายตอนตี 1-2
            นับเป็นวันไหน)
          </Step>
          <Step>
            นโยบายสต็อกไม่พอ (เตือนอย่างเดียว หรือบล็อกการขาย) — ตั้งได้ทั้งร้านหรือเฉพาะบางวัตถุดิบ
          </Step>
          <Step>เพดานยอดที่หัวหน้ากะอนุมัติคืนเงินได้เอง และธีมสี (สว่าง/มืด/ตามระบบ)</Step>
        </StepList>
      </>
    ),
  },
  {
    id: "users",
    title: "จัดการผู้ใช้",
    body: (
      <StepList>
        <Step>
          กด &quot;เชิญผู้ใช้ใหม่&quot; กรอกอีเมลและเลือกบทบาท ระบบจะส่งลิงก์เชิญไปทางอีเมล
        </Step>
        <Step>
          ปิด/เปิดการใช้งานบัญชีพนักงานที่ลาออกหรือพักงานได้ทันที (ไม่ต้องลบบัญชี ประวัติยังอยู่ครบ)
        </Step>
        <Step>
          เชิญผิดบทบาท แก้ไขได้ที่ dropdown ช่อง &quot;บทบาท&quot; ในตารางรายชื่อผู้ใช้ —
          ระบบจะให้ยืนยันก่อนเปลี่ยนทุกครั้ง เพราะมีผลกับสิทธิ์การเข้าถึงทันที
        </Step>
      </StepList>
    ),
  },
  {
    id: "roles",
    title: "บทบาทและสิทธิ์การเข้าถึง",
    body: (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="py-2 pr-3 font-medium">บทบาท</th>
              <th className="py-2 pr-3 font-medium">เข้าถึงได้</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="py-2 pr-3 font-medium">เจ้าของร้าน</td>
              <td className="py-2 pr-3">ทุกเมนู รวมถึงตั้งค่าระบบและจัดการผู้ใช้ทั้งหมด</td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">ผู้จัดการ</td>
              <td className="py-2 pr-3">
                ทุกเมนูยกเว้นตั้งค่าระบบ — เชิญผู้ใช้ได้เฉพาะหัวหน้ากะ/แคชเชียร์/พนักงาน
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">หัวหน้ากะ</td>
              <td className="py-2 pr-3">
                ขายหน้าร้าน, รับ/เบิกสต็อก, อนุมัติคืนเงินไม่เกินเพดาน, ดูรายงาน/แดชบอร์ด
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">แคชเชียร์</td>
              <td className="py-2 pr-3">ขายหน้าร้าน, ขอคืนเงิน (รออนุมัติ)</td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">พนักงาน</td>
              <td className="py-2 pr-3">รับ/เบิกสต็อกเท่านั้น</td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">ฝ่ายบัญชี</td>
              <td className="py-2 pr-3">
                บันทึก/ดูค่าใช้จ่าย และดูรายงานการเงินเท่านั้น — เข้า POS/สต็อกไม่ได้
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  },
];

export function GuideContent() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <nav className="flex flex-wrap gap-2 text-sm">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground rounded-full px-3 py-1.5 transition-colors"
              >
                {s.title}
              </a>
            ))}
          </nav>
        </CardContent>
      </Card>

      {SECTIONS.map((s) => (
        <Card key={s.id} id={s.id} className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">{s.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-foreground space-y-2 text-sm leading-relaxed">
            {s.body}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
