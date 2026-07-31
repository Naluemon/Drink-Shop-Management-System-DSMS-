import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Thousands-grouped display formatting (e.g. 1,234.50) for any on-screen
// number — money, stock quantities, counts. Not for CSV export values or
// literal "type this into the input" hint text, where a plain number is
// required instead.
export function formatNumber(amount: number, decimals = 2): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMoney(amount: number): string {
  return formatNumber(amount, 2);
}

export function formatBaht(amount: number): string {
  return `${formatMoney(amount)} บาท`;
}

// Client-only — triggers a browser download for a base64-encoded file
// returned by a Server Action (export/report endpoints that hand back a
// string or base64 body rather than a Route Handler response). Only call
// from a "use client" component.
export function downloadBase64File(filename: string, base64: string, mimeType: string) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
