"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { api, useApi } from "@/lib/api";
import { DECISION, fmtDateTime, fmtMoney } from "@/lib/format";
import type { AccessEntry, Complaint, Order, TimelineCall, TimelineMessage } from "@/lib/types";
import { ComplaintBadge, ErrorBox, Loading, OrderBadge } from "@/components/ui";
import Timeline from "@/components/Timeline";
import Map from "@/components/Map";

type Detail = {
  complaint: Complaint;
  order: Order;
  messages: TimelineMessage[];
  calls: TimelineCall[];
  path: { lat: number; lng: number }[];
  access: AccessEntry[];
};

const TARGET: Record<string, string> = { message: "رسالة صوتية", call: "تسجيل مكالمة", pickup_photo: "صورة الاستلام" };

export default function ComplaintPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<Detail>(`/admin/complaints/${id}`);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const { complaint: c, order } = data;

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setActionError(null);
    try {
      await api(path, { method: "POST", body });
      setNote("");
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const decide = (decision: string) => act(`/admin/complaints/${c.id}/decide`, { decision, note });

  return (
    <>
      <div className="head">
        <div>
          <div className="crumb">
            <Link href="/complaints">الشكاوى</Link> › شكوى #{c.id} على <Link href={`/orders/${order.id}`}>طلب #{order.id}</Link>
          </div>
          <h1>{c.reason}</h1>
          <div className="muted">
            فتحها {c.opened_by_role === "customer" ? "الزبون" : "الموصّل"} {c.opened_by_name} · {fmtDateTime(c.created_at)}
          </div>
        </div>
        <ComplaintBadge status={c.status} />
      </div>

      {c.details && <div className="card">«{c.details}»</div>}

      <div className="split">
        <section className="card wide">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <h2 style={{ margin: 0 }}>سجل الطلب كاملاً</h2>
            <button className="btn small" onClick={() => setShowMap((s) => !s)}>
              {showMap ? "إخفاء المسار" : "عرض مسار الموصّل"}
            </button>
          </div>
          <p className="muted" style={{ margin: "4px 0 8px" }}>
            كل استماع أو عرض يُسجّل باسمك.
          </p>
          {showMap && (
            <div style={{ margin: "8px 0 12px" }}>
              <Map
                height={300}
                points={[
                  { ...order.pickup, label: "الاستلام", color: "#0b5d4b" },
                  { ...order.dropoff, label: "التسليم", color: "#e3b23c" },
                ]}
                path={data.path}
              />
            </div>
          )}
          <Timeline order={order} messages={data.messages} calls={data.calls} complaintId={c.id} />
        </section>

        <aside className="narrow">
          <div className="card">
            <h2>تفاصيل الطلب</h2>
            <div className="kv"><span>الحالة</span><OrderBadge status={order.status} /></div>
            <div className="kv"><span>الزبون</span><span>{order.customer.name}</span></div>
            <div className="kv"><span>الموصّل</span><span>{order.courier?.name ?? "—"}</span></div>
            <div className="kv"><span>المبلغ</span><span>{fmtMoney(order.price)} · نقداً</span></div>
            <div className="kv"><span>رمز التسليم</span><span>{order.deliveredAt ? "أُدخل بشكل صحيح" : "لم يُدخل"}</span></div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ margin: 0 }}>القرار</h2>
            {c.decision && (
              <div className="badge b-green" style={{ whiteSpace: "normal" }}>
                {DECISION[c.decision]}
                {c.decision_note ? `: ${c.decision_note}` : ""} · {c.decided_by_name}
              </div>
            )}
            {c.status !== "resolved" && (
              <>
                {!c.assigned_name && (
                  <button className="btn" disabled={busy} onClick={() => act(`/admin/complaints/${c.id}/assign`)}>
                    تولّي هذه الشكوى
                  </button>
                )}
                {c.assigned_name && <span className="muted">المسؤول: {c.assigned_name}</span>}
                <label className="field">
                  ملاحظة القرار (تصل للزبون والموصّل)
                  <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <button className="btn primary" disabled={busy} onClick={() => decide("customer")}>
                  لصالح الزبون (استرداد)
                </button>
                <button className="btn" disabled={busy} onClick={() => decide("courier")}>
                  لصالح الموصّل
                </button>
                <button className="btn" disabled={busy} onClick={() => decide("info_requested")}>
                  طلب معلومات إضافية
                </button>
              </>
            )}
            <ErrorBox error={actionError} />
          </div>

          <div className="card">
            <h2>من استمع للتسجيلات</h2>
            {!data.access.length ? (
              <span className="muted">لم يستمع أحد بعد</span>
            ) : (
              data.access.map((a) => (
                <div key={a.id} className="muted" style={{ padding: "4px 0", fontSize: 13 }}>
                  {a.admin_name} · {TARGET[a.target_type] ?? a.target_type} · {fmtDateTime(a.created_at)}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
