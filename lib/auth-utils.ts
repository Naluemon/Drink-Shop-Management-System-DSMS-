import { prisma } from "./prisma";

// DECISIONS.md D13: Auth Policy ขั้นต่ำ
export const AUTH_CONFIG = {
  SESSION_TIMEOUT_HOURS: 8, // 8 ชั่วโมง
  MAX_FAILED_ATTEMPTS: 5, // 5 ครั้ง
  LOCKOUT_MINUTES: 15, // 15 นาที
  PASSWORD_MIN_LENGTH: 8, // 8 ตัวอักษร
} as const;

// ตรวจสอบว่าบัญชีถูกล็อกอยู่หรือไม่
export async function isAccountLocked(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      lockedUntil: true,
      failedLoginCount: true,
    },
  });

  if (!user) return false;

  // ถ้า lockedUntil ผ่านไปแล้ว ให้ปลดล็อก
  if (user.lockedUntil && user.lockedUntil < new Date()) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: null,
        failedLoginCount: 0,
      },
    });
    return false;
  }

  return user.lockedUntil !== null;
}

// เพิ่มจำนวนครั้งที่ล็อกอินผิด
export async function incrementFailedLogin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginCount: true },
  });

  if (!user) return;

  const newCount = user.failedLoginCount + 1;

  // ถ้าถึงจำนวนสูงสุดแล้ว ให้ล็อกบัญชี
  if (newCount >= AUTH_CONFIG.MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date();
    lockedUntil.setMinutes(lockedUntil.getMinutes() + AUTH_CONFIG.LOCKOUT_MINUTES);

    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: newCount,
        lockedUntil,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: newCount },
    });
  }
}

// รีเซ็ตจำนวนครั้งที่ล็อกอินผิด (เมื่อล็อกอินสำเร็จ)
export async function resetFailedLogin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
}

// ตรวจสอบ session timeout (8 ชั่วโมง)
export function isSessionExpired(lastSignIn: Date | null): boolean {
  if (!lastSignIn) return true;

  const now = new Date();
  const sessionAge = now.getTime() - lastSignIn.getTime();
  const maxAge = AUTH_CONFIG.SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;

  return sessionAge > maxAge;
}

// ตรวจสอบว่า user ยัง active อยู่หรือไม่
export async function isUserActive(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });

  return user?.isActive ?? false;
}
