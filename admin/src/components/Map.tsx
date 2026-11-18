"use client";

import dynamic from "next/dynamic";

// Leaflet يعمل في المتصفح فقط
const Map = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="map empty" style={{ height: 360 }}>جارٍ تحميل الخريطة…</div>,
});

export default Map;
export type { MapPoint } from "./MapView";
