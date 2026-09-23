import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFormatDate(d: string | number | Date | null | undefined, fallback: string = 'Historical'): string {
  if (!d) return fallback;
  if (typeof d === 'string' && (d === 'DATE_NOT_RECORDED' || d.toLowerCase().includes('not_recorded') || d.toLowerCase().includes('unknown') || d.toLowerCase().includes('invalid'))) {
    return fallback;
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
