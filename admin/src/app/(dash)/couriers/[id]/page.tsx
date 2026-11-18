"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, auth, mediaSrc, useApi } from "@/lib/api";
import { TYPE, fmtDateTime, fmtMoney } from "@/lib/format";
import type { Order, PublicUser } from "@/lib/types";
import { ErrorBox, Loading, OrderBadge, UserBadge } from "@/components/ui";

type Detail = {
  courier: PublicUser & { createdAt: string; idDocUrl: string | null; vehiclePhotoUrl: string | null };
  orders: Order[];
};

export default function CourierPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<Detail>(`/admin/couriers/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const isAdmin = auth.admin()?.role === "admin";

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const c = data.courier;

  const act = async (path: string) => {
    try {
      await api(path, { method: "POST" });
      setActionError(null);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <div className="crumb">
            <Link href="/couriers">الموصّلون</Link> › {c.name}
          </div>
          <h1>{c.name}</h1>
          <div className="muted">
            <span className="ltr">{c.phone}</span> · سجّل {fmtDateTime(c.createdAt)} · التقييم {c.rating ?? "—"}
          </div>
        </div>
        <UserBadge status={c.status} />
      </div>
      <ErrorBox error={actionError} />

      <div className="split">
        <div className="wide card table-wrap" style={{ padding: 0 }}>
          <h2 style={{ padding: "18px 18px 0" }}>آخر الطلبات</h2>
          {!data.orders.length ? (
            <div className="empty">لا توجد طلبات بعد</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>التاريخ</th>
                  <th>النوع</th>
                  <th>أجرته</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="link" onClick={() => router.push(`/orders/${o.id}`)}>
                    <td>{o.id}</td>
                    <td>{fmtDateTime(o.createdAt)}</td>
                    <td>{TYPE[o.type]}</td>
                    <td>{fmtMoney(o.courierFee)}</td>
                    <td>
                      <OrderBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="narrow">
          <div className="card">
            <h2>الوثائق</h2>
            <div className="kv"><span>المركبة</span><span>{c.vehicle ?? "—"}</span></div>
            <div className="kv"><span>رقم اللوحة</span><span>{c.plate || "—"}</span></div>
            {c.idDocUrl ? (
              <>
                <p className="muted">بطاقة التعريف</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaSrc(c.idDocUrl)} alt="بطاقة التعريف" className="thumb" />
              </>
            ) : (
              <p className="muted">لم يرفع بطاقة التعريف بعد</p>
            )}
            {c.vehiclePhotoUrl && (
              <>
                <p className="muted">صورة المركبة</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaSrc(c.vehiclePhotoUrl)} alt="صورة المركبة" className="thumb" />
              </>
            )}
          </div>

          {isAdmin && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ margin: 0 }}>الإجراءات</h2>
              {c.status === "pending" && (
                <button className="btn primary" disabled={!c.hasDocuments} onClick={() => act(`/admin/couriers/${c.id}/approve`)}>
                  قبول الموصّل وتفعيل حسابه
                </button>
              )}
              {c.status === "active" && (
                <button className="btn danger" onClick={() => confirm("إيقاف هذا الموصّل؟") && act(`/admin/users/${c.id}/suspend`)}>
                  إيقاف الحساب
                </button>
              )}
              {c.status === "suspended" && (
                <button className="btn" onClick={() => act(`/admin/users/${c.id}/activate`)}>
                  إعادة تفعيل الحساب
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
