import { Router } from 'express';
import { db } from '../db.js';
import { HttpError, requireUser, publicUser } from '../auth.js';
import { uploadImage } from '../media.js';
import { dispatchWaiting, currentOffer, getOrder, orderView } from '../orders-service.js';
import { emitToAdmins, emitToOrder } from '../realtime.js';

const r = Router();
r.use(requireUser('courier'));

r.post(
  '/documents',
  uploadImage.fields([
    { name: 'idDoc', maxCount: 1 },
    { name: 'vehiclePhoto', maxCount: 1 },
  ]),
  (req, res) => {
    const idDoc = req.files?.idDoc?.[0]?.filename;
    const vehiclePhoto = req.files?.vehiclePhoto?.[0]?.filename;
    const vehicle = String(req.body.vehicle || '').trim();
    const plate = String(req.body.plate || '').trim();
    if (!idDoc || !vehiclePhoto || !vehicle) throw new HttpError(400, 'أرسل صورة بطاقة التعريف وصورة المركبة ونوعها');
    db.prepare('UPDATE users SET id_doc = ?, vehicle_photo = ?, vehicle = ?, plate = ? WHERE id = ?').run(
      idDoc,
      vehiclePhoto,
      vehicle,
      plate,
      req.user.id,
    );
    emitToAdmins('courier:pending', { id: req.user.id });
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  },
);

r.put('/availability', (req, res) => {
  if (req.user.status !== 'active') throw new HttpError(403, 'حسابك ينتظر موافقة الإدارة');
  const available = req.body.available ? 1 : 0;
  db.prepare('UPDATE users SET available = ? WHERE id = ?').run(available, req.user.id);
  if (available) dispatchWaiting();
  res.json({ available: Boolean(available) });
});

export function updateCourierLocation(courierId, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  db.prepare("UPDATE users SET lat = ?, lng = ?, location_at = datetime('now') WHERE id = ?").run(lat, lng, courierId);
  const active = db
    .prepare("SELECT id FROM orders WHERE courier_id = ? AND status IN ('accepted','picked_up')")
    .all(courierId);
  for (const { id } of active) {
    db.prepare('INSERT INTO courier_path (order_id, lat, lng) VALUES (?, ?, ?)').run(id, lat, lng);
    emitToOrder(id, 'courier:location', { orderId: id, lat, lng, at: new Date().toISOString() });
  }
  emitToAdmins('courier:location', { courierId, lat, lng });
}

r.post('/location', (req, res) => {
  updateCourierLocation(req.user.id, Number(req.body.lat), Number(req.body.lng));
  res.json({ ok: true });
});

/** العرض الحالي (إن وُجد) — مفيد عند إعادة فتح التطبيق */
r.get('/offer', (req, res) => {
  const searching = db.prepare("SELECT id FROM orders WHERE status = 'searching'").all();
  for (const { id } of searching) {
    const o = currentOffer(id);
    if (o?.courierId === req.user.id) {
      return res.json({ offer: { order: orderView(getOrder(id), { kind: 'user', id: req.user.id }), expiresAt: o.expiresAt } });
    }
  }
  res.json({ offer: null });
});

r.get('/earnings', (req, res) => {
  const q = (where) =>
    db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(courier_fee),0) AS earned, COALESCE(SUM(price),0) AS collected
         FROM orders WHERE courier_id = ? AND status = 'delivered' AND ${where}`,
      )
      .get(req.user.id);
  const cashDue = db
    .prepare(
      `SELECT COALESCE(SUM(price - courier_fee),0) AS due FROM orders
       WHERE courier_id = ? AND status = 'delivered' AND payment_method = 'cash' AND cash_settled = 0`,
    )
    .get(req.user.id).due;
  res.json({
    today: q("date(delivered_at) = date('now')"),
    week: q("delivered_at >= datetime('now','-7 days')"),
    total: q('1=1'),
    cashDueToCompany: cashDue,
  });
});

export default r;
