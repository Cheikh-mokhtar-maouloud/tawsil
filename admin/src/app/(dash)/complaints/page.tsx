"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { COMPLAINT_STATUS, DECISION, fmtDateTime } from "@/lib/format";
import type { Complaint } from "@/lib/types";
import { ComplaintBadge, ErrorBox, Loading } from "@/components/ui";

export default function ComplaintsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useApi<{ complaints: Complaint[] }>(
    `/admin/complaints${status ? `?status=${status}` : ""}`,
  );
  useSocketEvent("complaint:new", reload);

  return (
    <>
      <div className="head">
        <h1>الشكاوى</h1>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
          <option value="">كل الشكاوى</option>
          {Object.entries(COMPLAINT_STATUS).map(([k, v]) => (
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
        ) : !data?.complaints.length ? (
          <div className="empty">لا توجد شكاوى</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>الطلب</th>
                <th>فتحها</th>
                <th>السبب</th>
                <th>المسؤول</th>
                <th>الحالة</th>
                <th>القرار</th>
              </tr>
            </thead>
            <tbody>
              {data.complaints.map((c) => (
                <tr key={c.id} className="link" onClick={() => router.push(`/complaints/${c.id}`)}>
                  <td>{c.id}</td>
                  <td>{fmtDateTime(c.created_at)}</td>
                  <td>#{c.order_id}</td>
                  <td>
                    {c.opened_by_role === "customer" ? "الزبون" : "الموصّل"} · {c.opened_by_name}
                  </td>
                  <td>{c.reason}</td>
                  <td>{c.assigned_name ?? <span className="muted">—</span>}</td>
                  <td>
                    <ComplaintBadge status={c.status} />
                  </td>
                  <td>{c.decision ? DECISION[c.decision] : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
