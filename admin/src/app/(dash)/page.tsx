"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { fmtMoney } from "@/lib/format";
import { ErrorBox, Loading } from "@/components/ui";

type Stats = {
  today: { orders: number; delivered: number; revenue: number; commission: number };
  activeOrders: number;
  couriersOnline: number;
  couriersPending: number;
  openComplaints: number;
  cashOutstanding: number;
  daily: { day: string; orders: number; delivered: number; revenue: number }[];
};

/** آخر 14 يوماً حتى لو لم توجد طلبات في بعض الأيام */
function fillDays(daily: Stats["daily"]) {
  const map = new Map(daily.map((d) => [d.day, d]));
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
    return map.get(d) ?? { day: d, orders: 0, delivered: 0, revenue: 0 };
  });
}

export default function Dashboard() {
  const { data, error, loading, reload } = useApi<Stats>("/admin/stats");
  useSocketEvent("order:new", reload);
  useSocketEvent("order:update", reload);
  useSocketEvent("complaint:new", reload);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  const days = fillDays(data.daily);
  const max = Math.max(1, ...days.map((d) => d.orders));

  return (
    <>
      <div className="head">
        <h1>الرئيسية</h1>
        <span className="crumb">يتحدث تلقائياً</span>
      </div>

      <div className="grid cols-4">
        <div className="card stat">
          <div className="label">طلبات اليوم</div>
          <div className="value">{data.today.orders}</div>
          <div className="sub">تم تسليم {data.today.delivered}</div>
        </div>
        <div className="card stat">
          <div className="label">إيرادات اليوم</div>
          <div className="value">{fmtMoney(data.today.revenue)}</div>
          <div className="sub">عمولة الشركة {fmtMoney(data.today.commission)}</div>
        </div>
        <Link href="/orders" className="card stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="label">طلبات جارية الآن</div>
          <div className="value">{data.activeOrders}</div>
          <div className="sub">{data.couriersOnline} موصّل متاح</div>
        </Link>
        <Link href="/complaints" className="card stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="label">شكاوى مفتوحة</div>
          <div className="value" style={{ color: data.openComplaints ? "var(--danger)" : undefined }}>{data.openComplaints}</div>
          <div className="sub">تحتاج مراجعة</div>
        </Link>
        <Link href="/couriers" className="card stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="label">موصّلون ينتظرون الموافقة</div>
          <div className="value">{data.couriersPending}</div>
          <div className="sub">راجع وثائقهم</div>
        </Link>
        <Link href="/finance" className="card stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="label">نقد عند الموصّلين</div>
          <div className="value">{fmtMoney(data.cashOutstanding)}</div>
          <div className="sub">حصة الشركة غير المسلّمة</div>
        </Link>
      </div>

      <div className="card">
        <h2>الطلبات خلال آخر 14 يوماً</h2>
        <div className="bars" role="img" aria-label="عدد الطلبات اليومية خلال آخر 14 يوماً">
          {days.map((d) => (
            <div className="bar" key={d.day} title={`${d.day}: ${d.orders} طلب، ${d.delivered} تم تسليمها`}>
              <span className="n">{d.orders || ""}</span>
              <div className="fill" style={{ height: `${(d.orders / max) * 120}px` }} />
              <span className="d">{d.day.slice(8)}/{d.day.slice(5, 7)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
