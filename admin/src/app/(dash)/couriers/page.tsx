"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { USER_STATUS, fmtDateTime, fmtMoney } from "@/lib/format";
import type { PublicUser } from "@/lib/types";
import { ErrorBox, Loading, UserBadge } from "@/components/ui";

type Row = PublicUser & { createdAt: string; delivered: number; cashDue: number };

export default function CouriersPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useApi<{ couriers: Row[] }>(`/admin/couriers${status ? `?status=${status}` : ""}`);
  useSocketEvent("courier:pending", reload);

  return (
    <>
      <div className="head">
        <h1>الموصّلون</h1>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
          <option value="">الكل</option>
          {Object.entries(USER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox error={error} />
      <div className="card table-wrap" style={{ padding: 0 }}>
        {loading && !data ? (
          <Loading />
        ) : !data?.couriers.length ? (
          <div className="empty">لا يوجد موصّلون</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>المركبة</th>
                <th>الحالة</th>
                <th>متاح الآن</th>
                <th>توصيلات</th>
                <th>التقييم</th>
                <th>نقد مستحق للشركة</th>
                <th>التسجيل</th>
              </tr>
            </thead>
            <tbody>
              {data.couriers.map((c) => (
                <tr key={c.id} className="link" onClick={() => router.push(`/couriers/${c.id}`)}>
                  <td>{c.name}</td>
                  <td className="ltr">{c.phone}</td>
                  <td>
                    {c.vehicle ?? <span className="muted">لم يرفع الوثائق</span>} {c.plate ? `· ${c.plate}` : ""}
                  </td>
                  <td>
                    <UserBadge status={c.status} />
                  </td>
                  <td>{c.available ? <span className="badge b-green">متاح</span> : <span className="muted">—</span>}</td>
                  <td>{c.delivered}</td>
                  <td>{c.rating ?? "—"}</td>
                  <td>{fmtMoney(c.cashDue)}</td>
                  <td>{fmtDateTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
