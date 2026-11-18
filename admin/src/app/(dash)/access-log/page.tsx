"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { AccessEntry } from "@/lib/types";
import { ErrorBox, Loading } from "@/components/ui";

const TARGET: Record<string, string> = { message: "رسالة صوتية", call: "تسجيل مكالمة", pickup_photo: "صورة الاستلام" };

export default function AccessLogPage() {
  const { data, error, loading } = useApi<{ log: AccessEntry[] }>("/admin/access-log");
  return (
    <>
      <div className="head">
        <h1>سجل الاستماع</h1>
        <span className="muted">كل مرة يفتح فيها موظف تسجيلاً أو صورة</span>
      </div>
      <ErrorBox error={error} />
      <div className="card table-wrap" style={{ padding: 0 }}>
        {loading && !data ? (
          <Loading />
        ) : !data?.log.length ? (
          <div className="empty">لم يستمع أحد لأي تسجيل بعد</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>الموظف</th>
                <th>ما فتحه</th>
                <th>الطلب</th>
                <th>الشكوى</th>
              </tr>
            </thead>
            <tbody>
              {data.log.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.created_at)}</td>
                  <td>
                    {a.admin_name} <span className="muted ltr">({a.username})</span>
                  </td>
                  <td>{TARGET[a.target_type] ?? a.target_type}</td>
                  <td>{a.order_id ? <Link href={`/orders/${a.order_id}`}>#{a.order_id}</Link> : "—"}</td>
                  <td>{a.complaint_id ? <Link href={`/complaints/${a.complaint_id}`}>#{a.complaint_id}</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
