import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { HttpError, requireUser } from '../auth.js';
import { quote } from '../pricing.js';
import { uploadAudio, uploadImage } from '../media.js';
import { sendSms } from '../sms.js';
import { normalizePhone } from './auth.js';
import { emitToAdmins, emitToUser } from '../realtime.js';
import {
  getOrder,
  orderView,
  broadcastOrder,
  addSystemMessage,
  dispatch,
  clearOffer,
  rejectOffer,
  currentOffer,
  ACTIVE_STATUSES,
} from '../orders-service.js';

const r = Router();
r.use(requireUser());

const TYPES = ['letter', 'small', 'large'];
const viewer = (req) => ({ kind: 'user', id: req.user.id });

/** يجلب الطلب ويتأكد أن المستخدم طرف فيه */
export function participantOrder(req) {
  const order = getOrder(Number(req.params.id));
  if (!order) throw new HttpError(404, 'الطلب غير موجود');
  if (order.customer_id !== req.user.id && order.courier_id !== req.user.id) throw new HttpError(403, 'هذا الطلب ليس لك');
  return order;
}

function readPoints(body) {
  const n = (k) => Number(body[k]);
  const p = { pickupLat: n('pickupLat'), pickupLng: n('pickupLng'), dropoffLat: n('dropoffLat'), dropoffLng: n('dropoffLng') };
  if (Object.values(p).some((v) => !Number.isFinite(v))) throw new HttpError(400, 'حدد نقطة الاستلام ونقطة التسليم على الخريطة');
  return p;
}

r.post('/quote', (req, res) => {
  const type = TYPES.includes(req.body.type) ? req.body.type : 'letter';
  res.json(quote({ type, ...readPoints(req.body) }));
});

r.post('/', uploadAudio.single('locationVoice'), async (req, res) => {
  if (req.user.role !== 'customer') throw new HttpError(403, 'الطلبات للزبائن فقط');
  const b = req.body;
  const type = b.type;
  if (!TYPES.includes(type)) throw new HttpError(400, 'اختر نوع الشحنة');
  const points = readPoints(b);
  const pickupAddress = String(b.pickupAddress || '').trim();
  const dropoffAddress = String(b.dropoffAddress || '').trim();
  const recipientName = String(b.recipientName || '').trim();
  const recipientPhone = normalizePhone(b.recipientPhone);
  if (!pickupAddress || !dropoffAddress) throw new HttpError(400, 'اكتب وصفاً مختصراً للعنوانين');
  if (!recipientName || !recipientPhone) throw new HttpError(400, 'اكتب اسم المستلم ورقم هاتفه الصحيح');

  const q = quote({ type, ...points });
  if (q.tooFar) throw new HttpError(400, `المسافة أكبر من الحد المسموح (${q.maxDistanceKm} كم)`);

  const code = String(crypto.randomInt(1000, 10000));
  const info = db
    .prepare(
      `INSERT INTO orders (customer_id, type, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
        recipient_name, recipient_phone, notes, location_voice, location_voice_duration, distance_km, price, courier_fee, delivery_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.user.id,
      type,
      pickupAddress,
      points.pickupLat,
      points.pickupLng,
      dropoffAddress,
      points.dropoffLat,
      points.dropoffLng,
      recipientName,
      recipientPhone,
      String(b.notes || '').trim() || null,
      req.file?.filename ?? null,
      req.file ? Math.round(Number(b.locationVoiceDuration) || 0) : null,
      q.distanceKm,
      q.price,
      q.courierFee,
      code,
    );
  const id = Number(info.lastInsertRowid);
  if (req.file) {
    db.prepare("INSERT INTO messages (order_id, sender_id, kind, body, file, duration) VALUES (?, ?, 'voice', 'وصف المكان', ?, ?)").run(
      id,
      req.user.id,
      req.file.filename,
      Math.round(Number(b.locationVoiceDuration) || 0),
    );
  }
  sendSms(recipientPhone, `لديك شحنة في الطريق. رمز التسليم: ${code} — أعطه للموصّل عند الاستلام فقط`).catch((e) =>
    console.error('[sms]', e.message),
  );
  emitToAdmins('order:new', { id });
  dispatch(id);
  res.status(201).json({ order: orderView(getOrder(id), viewer(req)) });
});

r.get('/', (req, res) => {
  const col = req.user.role === 'customer' ? 'customer_id' : 'courier_id';
  const rows = db.prepare(`SELECT * FROM orders WHERE ${col} = ? ORDER BY id DESC LIMIT 100`).all(req.user.id);
  res.json({ orders: rows.map((o) => orderView(o, viewer(req))) });
});

r.get('/active', (req, res) => {
  const col = req.user.role === 'customer' ? 'customer_id' : 'courier_id';
  const rows = db
    .prepare(`SELECT * FROM orders WHERE ${col} = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) ORDER BY id DESC`)
    .all(req.user.id, ...ACTIVE_STATUSES);
  res.json({ orders: rows.map((o) => orderView(o, viewer(req))) });
});

r.get('/:id', (req, res) => {
  const order = getOrder(Number(req.params.id));
  if (!order) throw new HttpError(404, 'الطلب غير موجود');
  const offered = currentOffer(order.id)?.courierId === req.user.id;
  if (order.customer_id !== req.user.id && order.courier_id !== req.user.id && !offered) throw new HttpError(403, 'هذا الطلب ليس لك');
  res.json({ order: orderView(order, viewer(req)) });
});

r.post('/:id/accept', (req, res) => {
  if (req.user.role !== 'courier') throw new HttpError(403, 'للموصّلين فقط');
  const id = Number(req.params.id);
  const offer = currentOffer(id);
  if (!offer || offer.courierId !== req.user.id) throw new HttpError(409, 'انتهت مهلة هذا العرض');
  const changed = db
    .prepare("UPDATE orders SET courier_id = ?, status = 'accepted', accepted_at = datetime('now') WHERE id = ? AND status = 'searching'")
    .run(req.user.id, id).changes;
  clearOffer(id);
  if (!changed) throw new HttpError(409, 'الطلب لم يعد متاحاً');
  addSystemMessage(id, `قبل ${req.user.name} الطلب وهو في الطريق للاستلام`);
  broadcastOrder(id);
  res.json({ order: orderView(getOrder(id), viewer(req)) });
});

r.post('/:id/reject', (req, res) => {
  if (req.user.role !== 'courier') throw new HttpError(403, 'للموصّلين فقط');
  rejectOffer(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

r.post('/:id/pickup', uploadImage.single('photo'), (req, res) => {
  const order = participantOrder(req);
  if (order.courier_id !== req.user.id) throw new HttpError(403, 'للموصّل فقط');
  if (order.status !== 'accepted') throw new HttpError(409, 'لا يمكن تأكيد الاستلام الآن');
  if (!req.file) throw new HttpError(400, 'التقط صورة للشحنة عند الاستلام');
  db.prepare("UPDATE orders SET status = 'picked_up', pickup_photo = ?, picked_up_at = datetime('now') WHERE id = ?").run(
    req.file.filename,
    order.id,
  );
  addSystemMessage(order.id, 'تم استلام الشحنة، الموصّل في الطريق للتسليم');
  broadcastOrder(order.id);
  res.json({ order: orderView(getOrder(order.id), viewer(req)) });
});

r.post('/:id/deliver', (req, res) => {
  const order = participantOrder(req);
  if (order.courier_id !== req.user.id) throw new HttpError(403, 'للموصّل فقط');
  if (order.status !== 'picked_up') throw new HttpError(409, 'أكّد الاستلام أولاً');
  if (String(req.body.code || '').trim() !== order.delivery_code) throw new HttpError(400, 'رمز التسليم غير صحيح');
  db.prepare("UPDATE orders SET status = 'delivered', delivered_at = datetime('now'), closed_at = datetime('now') WHERE id = ?").run(
    order.id,
  );
  addSystemMessage(order.id, 'تم التسليم بنجاح');
  broadcastOrder(order.id);
  res.json({ order: orderView(getOrder(order.id), viewer(req)) });
});

r.post('/:id/cancel', (req, res) => {
  const order = participantOrder(req);
  const reason = String(req.body.reason || '').trim() || null;
  if (order.customer_id === req.user.id) {
    if (!['searching', 'accepted'].includes(order.status)) throw new HttpError(409, 'لا يمكن الإلغاء بعد استلام الشحنة، افتح شكوى بدلاً من ذلك');
    clearOffer(order.id);
    db.prepare("UPDATE orders SET status = 'cancelled', cancel_reason = ?, closed_at = datetime('now') WHERE id = ?").run(
      reason || 'ألغاه الزبون',
      order.id,
    );
    addSystemMessage(order.id, 'ألغى الزبون الطلب');
  } else {
    // الموصّل يتخلى عن الطلب قبل الاستلام: يعود الطلب للبحث عن موصّل آخر
    if (order.status !== 'accepted') throw new HttpError(409, 'لا يمكن التخلي عن الطلب بعد الاستلام');
    db.prepare("UPDATE orders SET status = 'searching', courier_id = NULL, accepted_at = NULL WHERE id = ?").run(order.id);
    db.prepare('INSERT OR IGNORE INTO order_rejections (order_id, courier_id) VALUES (?, ?)').run(order.id, req.user.id);
    addSystemMessage(order.id, 'اعتذر الموصّل، نبحث لك عن موصّل آخر');
    const prevCourier = req.user.id;
    broadcastOrder(order.id);
    emitToUser(prevCourier, 'order:update', orderView(getOrder(order.id), { kind: 'user', id: prevCourier }));
    dispatch(order.id);
    return res.json({ order: orderView(getOrder(order.id), viewer(req)) });
  }
  broadcastOrder(order.id);
  res.json({ order: orderView(getOrder(order.id), viewer(req)) });
});

r.post('/:id/rate', (req, res) => {
  const order = participantOrder(req);
  if (order.customer_id !== req.user.id) throw new HttpError(403, 'التقييم للزبون فقط');
  if (order.status !== 'delivered') throw new HttpError(409, 'التقييم بعد التسليم فقط');
  if (order.rating) throw new HttpError(409, 'قيّمت هذا الطلب من قبل');
  const rating = Math.round(Number(req.body.rating));
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'التقييم من 1 إلى 5');
  db.prepare('UPDATE orders SET rating = ?, rating_comment = ? WHERE id = ?').run(rating, String(req.body.comment || '') || null, order.id);
  db.prepare('UPDATE users SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?').run(rating, order.courier_id);
  res.json({ order: orderView(getOrder(order.id), viewer(req)) });
});

r.post('/:id/complaints', (req, res) => {
  const order = participantOrder(req);
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new HttpError(400, 'اختر سبب الشكوى');
  const open = db.prepare("SELECT id FROM complaints WHERE order_id = ? AND opened_by = ? AND status != 'resolved'").get(order.id, req.user.id);
  if (open) throw new HttpError(409, 'لديك شكوى مفتوحة على هذا الطلب، سنتواصل معك قريباً');
  const info = db
    .prepare('INSERT INTO complaints (order_id, opened_by, reason, details) VALUES (?, ?, ?, ?)')
    .run(order.id, req.user.id, reason, String(req.body.details || '').trim() || null);
  addSystemMessage(order.id, 'تم فتح شكوى، فريق الدعم سيراجع المحادثة والمكالمات');
  emitToAdmins('complaint:new', { id: Number(info.lastInsertRowid), orderId: order.id });
  res.status(201).json({ complaintId: Number(info.lastInsertRowid) });
});

r.get('/:id/complaints', (req, res) => {
  const order = participantOrder(req);
  const rows = db
    .prepare('SELECT id, reason, details, status, decision, decision_note, created_at FROM complaints WHERE order_id = ? AND opened_by = ? ORDER BY id DESC')
    .all(order.id, req.user.id);
  res.json({ complaints: rows });
});

export default r;
