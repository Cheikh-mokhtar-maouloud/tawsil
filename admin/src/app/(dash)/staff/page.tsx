"use client";

import { useState } from "react";
import { api, useApi, type AdminRole } from "@/lib/api";
import { ROLE, fmtDateTime } from "@/lib/format";
import { ErrorBox, Loading } from "@/components/ui";

type Staff = { id: number; username: string; name: string; role: AdminRole; active: number; created_at: string };

const ROLE_HELP: Record<AdminRole, string> = {
  admin: "كل الصلاحيات: الأسعار، قبول الموصّلين، الموظفون، سجل الاستماع",
  support: "الشكاوى والاستماع للتسجيلات وإلغاء الطلبات",
  accountant: "الطلبات وتسوية النقد، بدون الاستماع للتسجيلات",
};

export default function StaffPage() {
  const { data, error, loading, reload } = useApi<{ staff: Staff[] }>("/admin/staff");
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "support" as AdminRole });
  const [formError, setFormError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/admin/staff", { method: "POST", body: form });
      setForm({ username: "", password: "", name: "", role: "support" });
      setFormError(null);
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    }
  };
  const toggle = async (s: Staff) => {
    try {
      await api(`/admin/staff/${s.id}/toggle`, { method: "POST" });
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <>
      <div className="head">
        <h1>الموظفون</h1>
      </div>
      <div className="split">
        <div className="card wide table-wrap" style={{ padding: 0 }}>
          {loading && !data ? (
            <Loading />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>اسم المستخدم</th>
                  <th>الدور</th>
                  <th>أُضيف</th>
                  <th>الحالة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.staff.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="ltr">{s.username}</td>
                    <td>{ROLE[s.role]}</td>
                    <td>{fmtDateTime(s.created_at)}</td>
                    <td>{s.active ? <span className="badge b-green">مفعّل</span> : <span className="badge b-gray">موقوف</span>}</td>
                    <td>
                      <button className="btn small" onClick={() => toggle(s)}>
                        {s.active ? "إيقاف" : "تفعيل"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ErrorBox error={error} />
        </div>
        <form className="card narrow" onSubmit={add}>
          <h2 style={{ margin: 0 }}>إضافة موظف</h2>
          <label className="field">
            الاسم
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="field">
            اسم المستخدم
            <input className="input ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </label>
          <label className="field">
            كلمة المرور (8 أحرف على الأقل)
            <input
              className="input ltr"
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <label className="field">
            الدور
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}>
              {(Object.keys(ROLE) as AdminRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE[r]}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12 }}>{ROLE_HELP[form.role]}</span>
          </label>
          <ErrorBox error={formError} />
          <button className="btn primary">إضافة</button>
        </form>
      </div>
    </>
  );
}
