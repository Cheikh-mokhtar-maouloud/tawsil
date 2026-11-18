"use client";

import { useEffect, useState } from "react";
import { api, auth, useApi } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { ErrorBox, Loading } from "@/components/ui";

type Settings = Record<string, string>;

const FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "base_fare", label: "أجرة البداية (أوقية)" },
  { key: "per_km", label: "سعر الكيلومتر (أوقية)" },
  { key: "min_price", label: "أقل سعر للطلب (أوقية)" },
  { key: "mult_letter", label: "معامل الرسالة", hint: "1 = بدون زيادة" },
  { key: "mult_small", label: "معامل الطرد الصغير" },
  { key: "mult_large", label: "معامل الطرد الكبير" },
  { key: "commission_percent", label: "عمولة الشركة (%)" },
  { key: "max_distance_km", label: "أقصى مسافة للطلب (كم)" },
];

export default function PricingPage() {
  const { data, error, loading } = useApi<{ settings: Settings }>("/admin/settings");
  const [form, setForm] = useState<Settings>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [km, setKm] = useState(5);
  const canEdit = auth.admin()?.role === "admin";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setForm(data.settings);
  }, [data]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  const n = (k: string) => Number(form[k] || 0);
  const example = (type: string) => {
    const raw = (n("base_fare") + n("per_km") * km) * n(`mult_${type}`);
    return Math.max(n("min_price"), Math.round(raw / 5) * 5);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(FIELDS.map((f) => [f.key, Number(form[f.key])]));
      const r = await api<{ settings: Settings }>("/admin/settings", { method: "PUT", body });
      setForm(r.settings);
      setMsg("تم حفظ الأسعار، تُطبّق على الطلبات الجديدة فوراً");
      setSaveError(null);
    } catch (err) {
      setSaveError((err as Error).message);
      setMsg(null);
    }
  };

  return (
    <>
      <div className="head">
        <h1>الأسعار</h1>
      </div>
      <div className="split">
        <form className="card wide" onSubmit={save}>
          <p className="muted" style={{ marginTop: 0 }}>
            السعر = (أجرة البداية + سعر الكيلومتر × المسافة) × معامل نوع الشحنة، مقرّباً لأقرب 5 أوقيات. المسافة = الخط المستقيم × 1.3.
          </p>
          <div className="grid cols-4">
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                {f.label}
                <input
                  className="input ltr"
                  type="number"
                  step="any"
                  min="0"
                  value={form[f.key] ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
                {f.hint && <span style={{ fontSize: 12 }}>{f.hint}</span>}
              </label>
            ))}
          </div>
          {canEdit ? (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn primary">حفظ</button>
              {msg && <span className="badge b-green">{msg}</span>}
            </div>
          ) : (
            <p className="muted">تعديل الأسعار للمدير فقط.</p>
          )}
          <ErrorBox error={saveError} />
        </form>
        <aside className="narrow">
          <div className="card">
            <h2>مثال</h2>
            <label className="field">
              المسافة: {km} كم
              <input type="range" min={1} max={30} value={km} onChange={(e) => setKm(Number(e.target.value))} />
            </label>
            <div className="kv"><span>رسالة</span><span>{fmtMoney(example("letter"))}</span></div>
            <div className="kv"><span>طرد صغير</span><span>{fmtMoney(example("small"))}</span></div>
            <div className="kv"><span>طرد كبير</span><span>{fmtMoney(example("large"))}</span></div>
            <div className="kv">
              <span>أجرة الموصّل (رسالة)</span>
              <span>{fmtMoney(example("letter") - Math.round((example("letter") * n("commission_percent")) / 100))}</span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
