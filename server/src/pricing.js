import { getSettings } from './db.js';

export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * السعر = (أجرة البداية + سعر الكيلومتر × المسافة) × معامل نوع الشحنة
 * المسافة المحسوبة خط مستقيم × 1.3 لتقريب مسافة الطرق
 */
export function quote({ type, pickupLat, pickupLng, dropoffLat, dropoffLng }) {
  const s = getSettings();
  const straight = distanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const km = Math.round(straight * 1.3 * 10) / 10;
  const mult = Number(s[`mult_${type}`] || 1);
  const raw = (Number(s.base_fare) + Number(s.per_km) * km) * mult;
  const price = Math.max(Number(s.min_price), Math.round(raw / 5) * 5);
  const commission = Math.round((price * Number(s.commission_percent)) / 100);
  return {
    distanceKm: km,
    price,
    courierFee: price - commission,
    currency: s.currency,
    tooFar: km > Number(s.max_distance_km),
    maxDistanceKm: Number(s.max_distance_km),
  };
}
