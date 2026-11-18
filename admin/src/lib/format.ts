import type { OrderStatus, OrderType } from "./types";

export const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  searching: { label: "يبحث عن موصّل", cls: "b-gold" },
  accepted: { label: "في الطريق للاستلام", cls: "b-green" },
  picked_up: { label: "في الطريق للتسليم", cls: "b-green" },
  delivered: { label: "تم التسليم", cls: "b-ink" },
  cancelled: { label: "ملغى", cls: "b-gray" },
  no_courier: { label: "لم يتوفر موصّل", cls: "b-red" },
};

export const TYPE: Record<OrderType, string> = { letter: "رسالة", small: "طرد صغير", large: "طرد كبير" };

export const COMPLAINT_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "جديدة", cls: "b-red" },
  reviewing: { label: "قيد المراجعة", cls: "b-gold" },
  resolved: { label: "مغلقة", cls: "b-gray" },
};

export const DECISION: Record<string, string> = {
  customer: "لصالح الزبون",
  courier: "لصالح الموصّل",
  info_requested: "طُلبت معلومات إضافية",
};

export const ROLE: Record<string, string> = { admin: "مدير", support: "دعم فني", accountant: "محاسب" };
export const USER_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "مفعّل", cls: "b-green" },
  pending: { label: "ينتظر الموافقة", cls: "b-gold" },
  suspended: { label: "موقوف", cls: "b-red" },
};

/** التواريخ في قاعدة البيانات بتوقيت UTC بصيغة SQLite */
export const toDate = (s: string | null | undefined) => (s ? new Date(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z")) : null);

export const fmtTime = (s: string | null | undefined) =>
  toDate(s)?.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", hour12: false }) ?? "";

export const fmtDateTime = (s: string | null | undefined) =>
  toDate(s)?.toLocaleString("ar", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) ?? "—";

export const fmtMoney = (n: number | null | undefined) => `${(n ?? 0).toLocaleString("ar")} أوقية`;

export const fmtDuration = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
