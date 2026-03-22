import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";
// date-fns v3 exports locales from "date-fns/locale"
import { sl } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return format(parseISO(date), "dd. MM. yyyy", { locale: sl });
  } catch {
    return date;
  }
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return format(parseISO(date), "dd. MM. yyyy HH:mm", { locale: sl });
  } catch {
    return date;
  }
}

export function timeAgo(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return formatDistanceToNow(parseISO(date), { addSuffix: true, locale: sl });
  } catch {
    return date;
  }
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    in_service: "bg-yellow-100 text-yellow-800",
    shipped: "bg-blue-100 text-blue-800",
    decommissioned: "bg-gray-100 text-gray-600",
    approved: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    in_progress: "bg-blue-100 text-blue-800",
    expired: "bg-red-100 text-red-800",
    rejected: "bg-red-100 text-red-800",
    success: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    rolled_back: "bg-orange-100 text-orange-800",
    resolved: "bg-green-100 text-green-800",
    in_review: "bg-blue-100 text-blue-800",
    draft: "bg-gray-100 text-gray-600",
    submitted: "bg-blue-100 text-blue-800",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    high: "bg-red-100 text-red-800 border-red-200",
    medium: "bg-orange-100 text-orange-800 border-orange-200",
    low: "bg-yellow-100 text-yellow-800 border-yellow-200",
    critical: "bg-red-100 text-red-800",
    warning: "bg-orange-100 text-orange-800",
    info: "bg-blue-100 text-blue-800",
    success: "bg-green-100 text-green-800",
  };
  return map[severity] ?? "bg-gray-100 text-gray-600";
}

export function truncate(str: string, n = 30): string {
  return str.length > n ? str.slice(0, n) + "…" : str;
}
