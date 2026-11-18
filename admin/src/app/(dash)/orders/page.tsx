"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { STATUS, TYPE, fmtDateTime, fmtMoney } from "@/lib/format";
import type { Order } from "@/lib/types";
import { ErrorBox, Loading, OrderBadge } from "@/components/ui";

export default function OrdersPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (query) params.set("q", query);
  const { data, error, loading, reload } = useApi<{ orders: Order[] }>(`/admin/orders?${params}`);
  useSocketEvent("order:new", reload);
  useSocketEvent("order:update", reload);

  return (
    <>
      <div className="head">
        <h1>الطلبات</h1>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <label className="field" style={{ flex: "1 1 260px" }}>
          <span className="sr">بحث</span>
          <input className="input" placeholder="رقم الطلب، اسم أو هاتف" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">
          <span className="sr">الحالة</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" style={{ alignSelf: "flex-end" }}>
          بحث
        </button>
      </form>
      <ErrorBox error={error} />
      <div className="card table-wrap" style={{ padding: 0 }}>
        {loading && !data ? (
          <Loading />
        ) : !data?.orders.length ? (
          <div className="empty">لا توجد طلبات</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>الزبون</th>
                <th>الموصّل</th>
                <th>من ← إلى</th>
                <th>السعر</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id} className="link" onClick={() => router.push(`/orders/${o.id}`)}>
                  <td>{o.id}</td>
                  <td>{fmtDateTime(o.createdAt)}</td>
                  <td>{TYPE[o.type]}</td>
                  <td>{o.customer?.name}</td>
                  <td>{o.courier?.name ?? <span className="muted">—</span>}</td>
                  <td style={{ maxWidth: 280 }}>
                    {o.pickup.address} ← {o.dropoff.address}
                  </td>
                  <td>{fmtMoney(o.price)}</td>
                  <td>
                    <OrderBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
