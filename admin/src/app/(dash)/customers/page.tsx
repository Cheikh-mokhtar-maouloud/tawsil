"use client";

import { useState } from "react";
import { api, auth, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { PublicUser } from "@/lib/types";
import { ErrorBox, Loading, UserBadge } from "@/components/ui";

type Row = PublicUser & { orders: number; createdAt: string };

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useApi<{ customers: Row[] }>(`/admin/customers?q=${encodeURIComponent(query)}`);
  const isAdmin = auth.admin()?.role === "admin";

  const toggle = async (u: Row) => {
    try {
      await api(`/admin/users/${u.id}/${u.status === "suspended" ? "activate" : "suspend"}`, { method: "POST" });
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <>
      <div className="head">
        <h1>الزبائن</h1>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
        >
          <input className="input" placeholder="الاسم أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          <button className="btn">بحث</button>
        </form>
      </div>
      <ErrorBox error={error} />
      <div className="card table-wrap" style={{ padding: 0 }}>
        {loading && !data ? (
          <Loading />
        ) : !data?.customers.length ? (
          <div className="empty">لا يوجد زبائن</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>عدد الطلبات</th>
                <th>التسجيل</th>
                <th>الحالة</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {data.customers.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="ltr">{u.phone}</td>
                  <td>{u.orders}</td>
                  <td>{fmtDateTime(u.createdAt)}</td>
                  <td>
                    <UserBadge status={u.status} />
                  </td>
                  {isAdmin && (
                    <td>
                      <button className={`btn small ${u.status === "suspended" ? "" : "danger"}`} onClick={() => toggle(u)}>
                        {u.status === "suspended" ? "تفعيل" : "إيقاف"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
