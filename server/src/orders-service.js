import { db } from './db.js';
import { config } from './config.js';
import { distanceKm } from './pricing.js';
import { emitToUser, emitToOrder, emitToAdmins } from './realtime.js';
import { publicUser } from './auth.js';
import { mediaUrl } from './media.js';
import { pushToUser } from './push.js';

export const ACTIVE_STATUSES = ['searching', 'accepted', 'picked_up'];

export function getOrder(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

/** شكل الطلب كما يراه كل طرف (الزبون يرى رمز التسليم، الموصّل لا يراه) */
export function orderView(order, viewer) {
  if (!order) return null;
  const customer = db.prepare('SELECT * FROM users WHERE id = ?').get(order.customer_id);
  const courier = order.courier_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(order.courier_id) : null;
  const isCustomer = viewer?.kind === 'user' && viewer.id === order.customer_id;
  const isCourier = viewer?.kind === 'user' && viewer.id === order.courier_id;
  const isAdmin = viewer?.kind === 'admin';
  const showRecipientPhone = isCustomer || isAdmin || (isCourier && ['picked_up', 'delivered'].includes(order.status));

  const strip = (u) => {
    if (!u) return null;
    const p = publicUser(u);
    if (!isAdmin) delete p.phone; // إخفاء الأرقام بين الطرفين
    return { ...p, lat: isCustomer && u.role === 'courier' ? u.lat : undefined, lng: isCustomer && u.role === 'courier' ? u.lng : undefined };
  };

  return {
    id: order.id,
    type: order.type,
    status: order.status,
    pickup: { address: order.pickup_address, lat: order.pickup_lat, lng: order.pickup_lng },
    dropoff: { address: order.dropoff_address, lat: order.dropoff_lat, lng: order.dropoff_lng },
    recipient: { name: order.recipient_name, phone: showRecipientPhone ? order.recipient_phone : null },
    notes: order.notes,
    locationVoice: order.location_voice
      ? { url: mediaUrl(order.location_voice, viewer), duration: order.location_voice_duration }
      : null,
    distanceKm: order.distance_km,
    price: order.price,
    courierFee: isCustomer ? undefined : order.courier_fee,
    paymentMethod: order.payment_method,
    deliveryCode: isCustomer || isAdmin ? order.delivery_code : undefined,
    pickupPhoto: order.pickup_photo ? mediaUrl(order.pickup_photo, viewer) : null,
    rating: order.rating,
    ratingComment: order.rating_comment,
    cancelReason: order.cancel_reason,
    customer: strip(customer),
    courier: strip(courier),
    createdAt: order.created_at,
    acceptedAt: order.accepted_at,
    pickedUpAt: order.picked_up_at,
    deliveredAt: order.delivered_at,
    cashSettled: Boolean(order.cash_settled),
  };
}

/** يرسل تحديث الطلب لكل طرف بالشكل المناسب له */
export function broadcastOrder(orderId) {
  const order = getOrder(orderId);
  if (!order) return;
  emitToUser(order.customer_id, 'order:update', orderView(order, { kind: 'user', id: order.customer_id }));
  if (order.courier_id) emitToUser(order.courier_id, 'order:update', orderView(order, { kind: 'user', id: order.courier_id }));
  emitToAdmins('order:update', { id: order.id, status: order.status });
  const text = {
    accepted: 'قبل موصّل طلبك وهو في الطريق للاستلام',
    picked_up: 'استلم الموصّل الشحنة وهو في الطريق للتسليم',
    delivered: 'تم تسليم الشحنة بنجاح',
    no_courier: 'لم يتوفر موصّل حالياً',
  }[order.status];
  if (text) pushToUser(order.customer_id, { title: `طلب #${order.id}`, body: text, data: { type: 'order', orderId: order.id } });
}

export function addSystemMessage(orderId, body) {
  const info = db.prepare("INSERT INTO messages (order_id, kind, body) VALUES (?, 'system', ?)").run(orderId, body);
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  emitToOrder(orderId, 'message:new', { id: msg.id, orderId, kind: 'system', body, createdAt: msg.created_at });
}

// ---------------- توزيع الطلبات على الموصّلين ----------------

const offers = new Map(); // orderId -> { courierId, timer, expiresAt }
const retryTimers = new Map(); // orderId -> timer
const SEARCH_RADIUS_KM = 15;
const GIVE_UP_AFTER_MS = 5 * 60 * 1000;

export const currentOffer = (orderId) => offers.get(orderId);

function courierBusy(courierId) {
  return Boolean(
    db.prepare("SELECT 1 FROM orders WHERE courier_id = ? AND status IN ('accepted','picked_up') LIMIT 1").get(courierId),
  );
}

function hasPendingOffer(courierId) {
  for (const o of offers.values()) if (o.courierId === courierId) return true;
  return false;
}

function findNextCourier(order) {
  const candidates = db
    .prepare(
      `SELECT * FROM users
       WHERE role = 'courier' AND status = 'active' AND available = 1
         AND lat IS NOT NULL AND location_at >= datetime('now', '-10 minutes')
         AND id NOT IN (SELECT courier_id FROM order_rejections WHERE order_id = ?)`,
    )
    .all(order.id);
  return candidates
    .filter((c) => !courierBusy(c.id) && !hasPendingOffer(c.id))
    .map((c) => ({ c, d: distanceKm(c.lat, c.lng, order.pickup_lat, order.pickup_lng) }))
    .filter((x) => x.d <= SEARCH_RADIUS_KM)
    .sort((a, b) => a.d - b.d)[0];
}

export function dispatch(orderId) {
  const order = getOrder(orderId);
  if (!order || order.status !== 'searching' || offers.has(orderId)) return;

  const ageMs = Date.now() - new Date(order.created_at + 'Z').getTime();
  if (ageMs > GIVE_UP_AFTER_MS) {
    db.prepare("UPDATE orders SET status = 'no_courier', closed_at = datetime('now') WHERE id = ?").run(orderId);
    addSystemMessage(orderId, 'لم يتوفر موصّل حالياً، يمكنك إعادة الطلب بعد قليل');
    broadcastOrder(orderId);
    return;
  }

  const next = findNextCourier(order);
  if (!next) {
    // لا يوجد موصّل متاح: إعادة المحاولة بعد 15 ثانية
    clearTimeout(retryTimers.get(orderId));
    retryTimers.set(orderId, setTimeout(() => dispatch(orderId), 15_000));
    return;
  }

  const expiresAt = Date.now() + config.offerTimeoutSeconds * 1000;
  const timer = setTimeout(() => {
    offers.delete(orderId);
    db.prepare('INSERT OR IGNORE INTO order_rejections (order_id, courier_id) VALUES (?, ?)').run(orderId, next.c.id);
    emitToUser(next.c.id, 'order:offer:expired', { orderId });
    dispatch(orderId);
  }, config.offerTimeoutSeconds * 1000);
  offers.set(orderId, { courierId: next.c.id, timer, expiresAt });

  pushToUser(
    next.c.id,
    { title: 'طلب توصيل جديد', body: `${order.pickup_address} ← ${order.dropoff_address}`, data: { type: 'offer', orderId } },
    { onlyIfOffline: false },
  );
  emitToUser(next.c.id, 'order:offer', {
    order: orderView(order, { kind: 'user', id: next.c.id }),
    distanceToPickupKm: Math.round(next.d * 10) / 10,
    expiresAt,
  });
}

export function clearOffer(orderId) {
  const o = offers.get(orderId);
  if (o) clearTimeout(o.timer);
  offers.delete(orderId);
  clearTimeout(retryTimers.get(orderId));
  retryTimers.delete(orderId);
}

export function rejectOffer(orderId, courierId) {
  const o = offers.get(orderId);
  if (!o || o.courierId !== courierId) return false;
  clearOffer(orderId);
  db.prepare('INSERT OR IGNORE INTO order_rejections (order_id, courier_id) VALUES (?, ?)').run(orderId, courierId);
  dispatch(orderId);
  return true;
}

/** عند تشغيل الخادم: إعادة توزيع الطلبات التي كانت تبحث عن موصّل */
export function resumeSearching() {
  for (const { id } of db.prepare("SELECT id FROM orders WHERE status = 'searching'").all()) dispatch(id);
}

/** عندما يصبح موصّل متاحاً: جرّب الطلبات المنتظرة */
export function dispatchWaiting() {
  for (const { id } of db.prepare("SELECT id FROM orders WHERE status = 'searching'").all()) {
    if (!offers.has(id)) dispatch(id);
  }
}
