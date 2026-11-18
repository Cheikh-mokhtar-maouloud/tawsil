"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { api, auth, useApi } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { TYPE, fmtDateTime, fmtMoney, DECISION } from "@/lib/format";
import type { Complaint, Order, TimelineCall, TimelineMessage } from "@/lib/types";
import { ComplaintBadge, ErrorBox, Loading, OrderBadge } from "@/components/ui";
import Timeline from "@/components/Timeline";
import Map from "@/components/Map";

type Detail = {
  order: Order;
  messages: TimelineMessage[];
  calls: TimelineCall[];
  path: { lat: number; lng: number; at: string }[];
  complaints: Complaint[];
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<Detail>(`/admin/orders/${id}`);
  useSocketEvent<{ id: number }>("order:update", (o) => o.id === Number(id) && reload());
  const role = auth.admin()?.role;

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const { order } = data;

  const cancel = async () => {
    const reason = prompt("سبب الإلغاء:");
    if (reason === null) return;
    try {
      await api(`/admin/orders/${order.id}/cancel`, { method: "POST", body: { reason } });
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const settle = async () => {
    try {
      await api(`/admin/orders/${order.id}/settle-cash`, { method: "POST" });
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <div className="crumb">
            <Link href="/orders">الطلبات</Link> › طلب #{order.id}
          </div>
          <h1>
            {TYPE[order.type]} · {order.pickup.address} ← {order.dropoff.address}
          </h1>
        </div>
        <OrderBadge status={order.status} />
      </div>

      <div className="split">
        <div className="wide" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Map
            points={[
              { ...order.pickup, label: `الاستلام: ${order.pickup.address}`, color: "#0b5d4b" },
              { ...order.dropoff, label: `التسليم: ${order.dropoff.address}`, color: "#e3b23c" },
            ]}
            path={data.path}
          />
          <section className="card">
            <h2>سجل الطلب</h2>
            <p className="muted" style={{ marginTop: -6 }}>
              الاستماع للتسجيلات يُسجَّل باسمك في سجل الوصول.
            </p>
            <Timeline order={order} messages={data.messages} calls={data.calls} />
          </section>
        </div>

        <aside className="narrow">
          <div className="card">
            <h2>تفاصيل الطلب</h2>
            <div className="kv"><span>الزبون</span><span>{order.customer.name} · <span className="ltr">{order.customer.phone}</span></span></div>
            <div className="kv"><span>الموصّل</span><span>{order.courier ? <Link href={`/couriers/${order.courier.id}`}>{order.courier.name}</Link> : "—"}</span></div>
            <div className="kv"><span>المستلم</span><span>{order.recipient.name} · <span className="ltr">{order.recipient.phone}</span></span></div>
            <div className="kv"><span>المسافة</span><span>{order.distanceKm} كم</span></div>
            <div className="kv"><span>السعر</span><span>{fmtMoney(order.price)} · نقداً</span></div>
            <div className="kv"><span>أجرة الموصّل</span><span>{fmtMoney(order.courierFee)}</span></div>
            <div className="kv"><span>رمز التسليم</span><span className="ltr">{order.deliveryCode}</span></div>
            <div className="kv"><span>أُنشئ</span><span>{fmtDateTime(order.createdAt)}</span></div>
            {order.deliveredAt && <div className="kv"><span>سُلّم</span><span>{fmtDateTime(order.deliveredAt)}</span></div>}
            {order.rating && <div className="kv"><span>التقييم</span><span>{"★".repeat(order.rating)} {order.ratingComment}</span></div>}
            {order.cancelReason && <div className="kv"><span>سبب الإلغاء</span><span>{order.cancelReason}</span></div>}
            {order.notes && <div className="kv"><span>ملاحظات</span><span>{order.notes}</span></div>}
          </div>

          {order.status === "delivered" && (
            <div className="card">
              <h2>النقد</h2>
              {order.cashSettled ? (
                <span className="badge b-green">سلّم الموصّل حصة الشركة</span>
              ) : (
                <>
                  <p style={{ marginTop: 0 }}>على الموصّل تسليم {fmtMoney(order.price - order.courierFee)}</p>
                  {role !== "support" && <button className="btn primary" onClick={settle}>تأكيد استلام المبلغ</button>}
                </>
              )}
            </div>
          )}

          {["searching", "accepted", "picked_up"].includes(order.status) && role !== "accountant" && (
            <button className="btn danger" onClick={cancel}>إلغاء الطلب</button>
          )}

          <div className="card">
            <h2>الشكاوى</h2>
            {!data.complaints.length ? (
              <span className="muted">لا توجد شكاوى</span>
            ) : (
              data.complaints.map((c) => (
                <div key={c.id} className="kv">
                  <Link href={`/complaints/${c.id}`}>{c.reason}</Link>
                  <span>
                    <ComplaintBadge status={c.status} /> {c.decision ? DECISION[c.decision] : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
