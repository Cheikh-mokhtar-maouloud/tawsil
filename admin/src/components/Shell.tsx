"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, auth, type Admin, type AdminRole } from "@/lib/api";
import { closeSocket, useSocketEvent } from "@/lib/socket";
import { ROLE } from "@/lib/format";

type Counts = { couriersPending: number; openComplaints: number; activeOrders: number };

const NAV: { href: string; label: string; roles: AdminRole[]; count?: keyof Counts }[] = [
  { href: "/", label: "الرئيسية", roles: ["admin", "support", "accountant"] },
  { href: "/live", label: "الخريطة المباشرة", roles: ["admin", "support"] },
  { href: "/orders", label: "الطلبات", roles: ["admin", "support", "accountant"], count: "activeOrders" },
  { href: "/complaints", label: "الشكاوى", roles: ["admin", "support"], count: "openComplaints" },
  { href: "/couriers", label: "الموصّلون", roles: ["admin", "support", "accountant"], count: "couriersPending" },
  { href: "/customers", label: "الزبائن", roles: ["admin", "support"] },
  { href: "/finance", label: "النقد والتسويات", roles: ["admin", "accountant"] },
  { href: "/pricing", label: "الأسعار", roles: ["admin", "support", "accountant"] },
  { href: "/staff", label: "الموظفون", roles: ["admin"] },
  { href: "/access-log", label: "سجل الاستماع", roles: ["admin"] },
];

export default function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    const a = auth.admin();
    if (!auth.token() || !a) router.replace("/login");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setAdmin(a);
  }, [router]);

  const refreshCounts = () =>
    api<Counts>("/admin/stats")
      .then(setCounts)
      .catch(() => {});

  useEffect(() => {
    if (!admin) return;
    refreshCounts();
    const t = setInterval(refreshCounts, 30_000);
    return () => clearInterval(t);
  }, [admin]);

  useSocketEvent("complaint:new", refreshCounts);
  useSocketEvent("courier:pending", refreshCounts);
  useSocketEvent("order:new", refreshCounts);
  useSocketEvent("order:update", refreshCounts);

  if (!admin) return null;

  const logout = () => {
    auth.clear();
    closeSocket();
    router.replace("/login");
  };

  return (
    <div className="shell">
      <nav className="side" aria-label="القائمة">
        <span className="brand">لوحة الإدارة</span>
        {NAV.filter((n) => n.roles.includes(admin.role)).map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          const c = n.count && counts ? counts[n.count] : 0;
          return (
            <Link key={n.href} href={n.href} className={active ? "active" : ""}>
              {n.label}
              {c ? <span className="count">{c}</span> : null}
            </Link>
          );
        })}
        <div className="who">
          {admin.name} · {ROLE[admin.role]}
          <br />
          <button onClick={logout} className="btn small" style={{ marginTop: 10 }}>
            تسجيل الخروج
          </button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
