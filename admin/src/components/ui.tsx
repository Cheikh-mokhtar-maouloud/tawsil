"use client";

import { useState } from "react";
import { api, mediaSrc } from "@/lib/api";
import { STATUS, COMPLAINT_STATUS, USER_STATUS, fmtDuration } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export const OrderBadge = ({ status }: { status: OrderStatus }) => (
  <span className={`badge ${STATUS[status]?.cls}`}>{STATUS[status]?.label ?? status}</span>
);

export const ComplaintBadge = ({ status }: { status: string }) => (
  <span className={`badge ${COMPLAINT_STATUS[status]?.cls}`}>{COMPLAINT_STATUS[status]?.label ?? status}</span>
);

export const UserBadge = ({ status }: { status: string }) => (
  <span className={`badge ${USER_STATUS[status]?.cls}`}>{USER_STATUS[status]?.label ?? status}</span>
);

export const Loading = () => <div className="empty">جارٍ التحميل…</div>;
export const ErrorBox = ({ error }: { error: string | null }) => (error ? <div className="error">{error}</div> : null);

/**
 * زر تشغيل تسجيل صوتي أو عرض صورة.
 * الرابط لا يُطلب إلا عند الضغط، والخادم يسجّل في سجل الوصول من فتح الملف ومتى.
 */
export function ProtectedMedia({
  type,
  id,
  complaintId,
  duration,
  label,
  primary,
}: {
  type: "message" | "call" | "pickup_photo";
  id: number;
  complaintId?: number;
  duration?: number | null;
  label?: string;
  primary?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/admin/media", { method: "POST", body: { type, id, complaintId } });
      setUrl(mediaSrc(r.url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (url && type === "pickup_photo") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="صورة الشحنة عند الاستلام" className="thumb" />;
  }
  if (url) return <audio src={url} controls autoPlay preload="auto" />;
  return (
    <span className="row">
      <button className={`btn small ${primary ? "primary" : ""}`} onClick={open} disabled={busy}>
        {type === "pickup_photo" ? "عرض الصورة" : `▶ ${label ?? "تشغيل"}${duration ? ` ${fmtDuration(duration)}` : ""}`}
      </button>
      {error && <span className="badge b-red">{error}</span>}
    </span>
  );
}
