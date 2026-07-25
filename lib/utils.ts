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
