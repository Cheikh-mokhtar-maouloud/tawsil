"use client";

import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import type { Order } from "@/lib/types";
import { ErrorBox, Loading } from "@/components/ui";

/**
 * الدفع نقداً: الموصّل يقبض المبلغ كاملاً من الزبون ثم يسلّم حصة الشركة (العمولة).
 * هذه الصفحة تعرض ما بقي عند كل موصّل وتسمح بتأكيد الاستلام طلباً بطلب.
 */
export default function FinancePage() {
  const { data, error, loading, reload } = useApi<{ orders: Order[] }>("/admin/orders?status=delivered");

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  const due = data.orders.filter((o) => o.paymentMethod === "cash" && !o.cashSettled);
  const byCourier = new Map<number, { name: string; total: number; orders: Order[] }>();
  for (const o of due) {
    if (!o.courier) continue;
    const g = byCourier.get(o.courier.id) ?? { name: o.courier.name, total: 0, orders: [] };
    g.total += o.price - o.courierFee;
    g.orders.push(o);
    byCourier.set(o.courier.id, g);
  }
  const groups = [...byCourier.entries()].sort((a, b) => b[1].total - a[1].total);

  const settle = async (orders: Order[]) => {
    try {
      for (const o of orders) await api(`/admin/orders/${o.id}/settle-cash`, { method: "POST" });
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <>
      <div className="head">
        <h1>النقد والتسويات</h1>
        <span className="muted">المجموع عند الموصّلين: {fmtMoney(groups.reduce((s, [, g]) => s + g.total, 0))}</span>
      </div>
      {!groups.length && <div className="card empty">كل الموصّلين سلّموا حصة الشركة</div>}
      {groups.map(([id, g]) => (
        <div key={id} className="card table-wrap">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>
              <Link href={`/couriers/${id}`}>{g.name}</Link> · {fmtMoney(g.total)}
            </h2>
            <button className="btn primary small" onClick={() => confirm(`تأكيد استلام ${fmtMoney(g.total)} من ${g.name}؟`) && settle(g.orders)}>
              استلمت المبلغ كاملاً
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>الطلب</th>
                <th>التسليم</th>
                <th>قبض من الزبون</th>
                <th>حصة الشركة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {g.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`}>#{o.id}</Link>
                  </td>
                  <td>{fmtDateTime(o.deliveredAt)}</td>
                  <td>{fmtMoney(o.price)}</td>
                  <td>{fmtMoney(o.price - o.courierFee)}</td>
                  <td>
                    <button className="btn small" onClick={() => settle([o])}>
                      تأكيد
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
