"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { TYPE } from "@/lib/format";
import type { Order, PublicUser } from "@/lib/types";
import { ErrorBox, Loading, OrderBadge } from "@/components/ui";
import Map, { type MapPoint } from "@/components/Map";

type Live = { couriers: (PublicUser & { lat: number; lng: number })[]; orders: Order[] };

export default function LivePage() {
  const { data, error, loading, setData, reload } = useApi<Live>("/admin/live");
  useSocketEvent<{ courierId: number; lat: number; lng: number }>("courier:location", (p) =>
    setData((d) => d && { ...d, couriers: d.couriers.map((c) => (c.id === p.courierId ? { ...c, lat: p.lat, lng: p.lng } : c)) }),
  );
  useSocketEvent("order:new", reload);
  useSocketEvent("order:update", reload);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  const points: MapPoint[] = [
    ...data.couriers.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      label: `${c.name}${c.available ? " · متاح" : " · غير متاح"}`,
      color: c.available ? "#0b5d4b" : "#56635e",
      radius: 8,
    })),
    ...data.orders.map((o) => ({
      lat: o.pickup.lat,
      lng: o.pickup.lng,
      label: `طلب #${o.id} · ${o.pickup.address}`,
      color: o.status === "searching" ? "#e3b23c" : "#15211d",
      radius: 6,
    })),
  ];

  return (
    <>
      <div className="head">
        <h1>الخريطة المباشرة</h1>
        <div className="row muted">
          <span className="badge b-green">● موصّل متاح</span>
          <span className="badge b-gold">● طلب يبحث عن موصّل</span>
          <span className="badge b-ink">● طلب جارٍ</span>
        </div>
      </div>
      <Map points={points} height={520} />
      <div className="card table-wrap" style={{ padding: 0 }}>
        <h2 style={{ padding: "18px 18px 0" }}>الطلبات الجارية ({data.orders.length})</h2>
        {!data.orders.length ? (
          <div className="empty">لا توجد طلبات جارية</div>
        ) : (
          <table>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`}>#{o.id}</Link>
                  </td>
                  <td>{TYPE[o.type]}</td>
                  <td>{o.pickup.address} ← {o.dropoff.address}</td>
                  <td>{o.courier?.name ?? "—"}</td>
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
