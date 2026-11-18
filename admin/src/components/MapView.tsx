"use client";

import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from "react-leaflet";

export type MapPoint = { lat: number; lng: number; label: string; color: string; radius?: number };

/**
 * خريطة بسيطة (OpenStreetMap) بدون مفاتيح.
 * المركز الافتراضي: نواكشوط.
 */
export default function MapView({
  points,
  path,
  height = 360,
}: {
  points: MapPoint[];
  path?: { lat: number; lng: number }[];
  height?: number;
}) {
  const all = [...points, ...(path ?? [])];
  const bounds = all.length >= 2 ? (all.map((p) => [p.lat, p.lng]) as [number, number][]) : undefined;
  const center: [number, number] = all.length === 1 ? [all[0].lat, all[0].lng] : [18.0858, -15.9785];

  return (
    <div className="map" style={{ height }}>
      <MapContainer
        center={center}
        zoom={13}
        bounds={bounds}
        boundsOptions={{ padding: [40, 40] }}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {path && path.length > 1 && (
          <Polyline positions={path.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#0b5d4b", weight: 4 }} />
        )}
        {points.map((p, i) => (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={p.radius ?? 9}
            pathOptions={{ color: "#fff", weight: 3, fillColor: p.color, fillOpacity: 1 }}
          >
            <Tooltip>{p.label}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
