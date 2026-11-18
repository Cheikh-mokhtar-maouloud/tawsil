import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, getSettings } from '../db.js';
import { HttpError, requireAdmin, signAdminToken, publicUser } from '../auth.js';
import { mediaUrl } from '../media.js';
import { getOrder, orderView, broadcastOrder, addSystemMessage, clearOffer, dispatchWaiting } from '../orders-service.js';
import { emitToUser } from '../realtime.js';
import { messageView } from './messages.js';

const r = Router();
const ALL = ['admin', 'support', 'accountant'];
const LISTEN = ['admin', 'support'];
const adminViewer = (req) => ({ kind: 'admin', id: req.admin.id });

r.post('/login', (req, res) => {
  const a = db.prepare('SELECT * FROM admins WHERE username = ?').get(String(req.body.username || ''));
  if (!a || !a.active || !bcrypt.compareSync(String(req.body.password || ''), a.password_hash))
    throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  res.json({ token: signAdminToken(a), admin: { id: a.id, username: a.username, name: a.name, role: a.role } });
});

r.use(requireAdmin(...ALL));

r.get('/me', (req, res) => res.json({ admin: req.admin }));

// ---------------- لوحة المؤشرات ----------------
r.get('/stats', (_req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const today = one(
    `SELECT COUNT(*) AS orders,
            SUM(status = 'delivered') AS delivered,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN price END),0) AS revenue,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN price - courier_fee END),0) AS commission
     FROM orders WHERE date(created_at) = date('now')`,
  );
  const daily = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS orders, SUM(status = 'delivered') AS delivered,
              COALESCE(SUM(CASE WHEN status = 'delivered' THEN price END),0) AS revenue
       FROM orders WHERE created_at >= date('now','-13 days') GROUP BY day ORDER BY day`,
    )
    .all();
  res.json({
    today: { ...today, delivered: today.delivered ?? 0 },
    activeOrders: one("SELECT COUNT(*) AS n FROM orders WHERE status IN ('searching','accepted','picked_up')").n,
    couriersOnline: one("SELECT COUNT(*) AS n FROM users WHERE role='courier' AND available=1 AND status='active'").n,
    couriersPending: one("SELECT COUNT(*) AS n FROM users WHERE role='courier' AND status='pending'").n,
    openComplaints: one("SELECT COUNT(*) AS n FROM complaints WHERE status != 'resolved'").n,
    cashOutstanding: one(
      "SELECT COALESCE(SUM(price - courier_fee),0) AS n FROM orders WHERE status='delivered' AND payment_method='cash' AND cash_settled=0",
    ).n,
    daily,
  });
});

r.get('/live', (_req, res) => {
  const couriers = db
    .prepare("SELECT * FROM users WHERE role='courier' AND status='active' AND lat IS NOT NULL AND location_at >= datetime('now','-15 minutes')")
    .all()
    .map((u) => ({ ...publicUser(u), lat: u.lat, lng: u.lng, locationAt: u.location_at }));
  const orders = db
    .prepare("SELECT * FROM orders WHERE status IN ('searching','accepted','picked_up') ORDER BY id DESC")
    .all()
    .map((o) => orderView(o, { kind: 'admin', id: 0 }));
  res.json({ couriers, orders });
});

// ---------------- الطلبات ----------------
r.get('/orders', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) {
    where.push('o.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.q) {
    where.push('(o.id = ? OR c.name LIKE ? OR c.phone LIKE ? OR k.name LIKE ? OR o.recipient_phone LIKE ?)');
    const q = String(req.query.q);
    params.push(Number(q) || -1, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = db
    .prepare(
      `SELECT o.* FROM orders o JOIN users c ON c.id = o.customer_id LEFT JOIN users k ON k.id = o.courier_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 200`,
    )
    .all(...params);
  res.json({ orders: rows.map((o) => orderView(o, adminViewer(req))) });
});

/** السجل الزمني الكامل لطلب: الرسائل، المكالمات، المسار — بدون روابط الصوت (تُطلب عبر /media مع تسجيل الوصول) */
function timeline(orderId) {
  const messages = db
    .prepare('SELECT * FROM messages WHERE order_id = ? ORDER BY id')
    .all(orderId)
    .map((m) => ({ ...messageView(m, null), audioUrl: null, hasAudio: Boolean(m.file) }));
  const calls = db
    .prepare('SELECT * FROM calls WHERE order_id = ? ORDER BY id')
    .all(orderId)
    .map((c) => ({
      id: c.id,
      callerId: c.caller_id,
      calleeId: c.callee_id,
      status: c.status,
      startedAt: c.started_at,
      answeredAt: c.answered_at,
      endedAt: c.ended_at,
      duration: c.duration,
      hasRecording: Boolean(c.recording_url),
    }));
  const path = db.prepare('SELECT lat, lng, at FROM courier_path WHERE order_id = ? ORDER BY id').all(orderId);
  return { messages, calls, path };
}

r.get('/orders/:id', (req, res) => {
  const order = getOrder(Number(req.params.id));
  if (!order) throw new HttpError(404, 'الطلب غير موجود');
  const complaints = db.prepare('SELECT * FROM complaints WHERE order_id = ? ORDER BY id DESC').all(order.id);
  res.json({ order: orderView(order, adminViewer(req)), ...timeline(order.id), complaints });
});

r.post('/orders/:id/cancel', requireAdmin('admin', 'support'), (req, res) => {
  const order = getOrder(Number(req.params.id));
  if (!order) throw new HttpError(404, 'الطلب غير موجود');
  if (['delivered', 'cancelled'].includes(order.status)) throw new HttpError(409, 'الطلب مغلق');
  clearOffer(order.id);
  db.prepare("UPDATE orders SET status='cancelled', cancel_reason=?, closed_at=datetime('now') WHERE id=?").run(
    `ألغته الإدارة: ${String(req.body.reason || '').trim() || 'بدون سبب'}`,
    order.id,
  );
  addSystemMessage(order.id, 'ألغت الإدارة هذا الطلب');
  broadcastOrder(order.id);
  res.json({ ok: true });
});

r.post('/orders/:id/settle-cash', requireAdmin('admin', 'accountant'), (req, res) => {
  const changed = db
    .prepare("UPDATE orders SET cash_settled = 1 WHERE id = ? AND status = 'delivered' AND payment_method='cash'")
    .run(Number(req.params.id)).changes;
  if (!changed) throw new HttpError(409, 'لا يوجد مبلغ لتسويته');
  res.json({ ok: true });
});

// ---------------- الموصّلون والزبائن ----------------
r.get('/couriers', (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const rows = db
    .prepare(`SELECT * FROM users WHERE role='courier' ${status ? 'AND status = ?' : ''} ORDER BY (status='pending') DESC, id DESC`)
    .all(...(status ? [status] : []));
  const stats = db.prepare(
    `SELECT COUNT(*) AS delivered, COALESCE(SUM(CASE WHEN payment_method='cash' AND cash_settled=0 THEN price - courier_fee END),0) AS cashDue
     FROM orders WHERE courier_id = ? AND status='delivered'`,
  );
  res.json({
    couriers: rows.map((u) => ({ ...publicUser(u), createdAt: u.created_at, ...stats.get(u.id) })),
  });
});

r.get('/couriers/:id', (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role='courier'").get(Number(req.params.id));
  if (!u) throw new HttpError(404, 'الموصّل غير موجود');
  const v = adminViewer(req);
  const orders = db.prepare('SELECT * FROM orders WHERE courier_id = ? ORDER BY id DESC LIMIT 50').all(u.id);
  res.json({
    courier: { ...publicUser(u), createdAt: u.created_at, idDocUrl: mediaUrl(u.id_doc, v), vehiclePhotoUrl: mediaUrl(u.vehicle_photo, v) },
    orders: orders.map((o) => orderView(o, v)),
  });
});

function setUserStatus(id, status) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, 'الحساب غير موجود');
  db.prepare('UPDATE users SET status = ?, available = CASE WHEN ? = \'active\' THEN available ELSE 0 END WHERE id = ?').run(status, status, id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  emitToUser(id, 'account:update', publicUser(fresh));
  if (status === 'active' && u.role === 'courier') dispatchWaiting();
  return publicUser(fresh);
}

r.post('/couriers/:id/approve', requireAdmin('admin'), (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role='courier'").get(Number(req.params.id));
  if (!u) throw new HttpError(404, 'الموصّل غير موجود');
  if (!u.id_doc || !u.vehicle_photo) throw new HttpError(409, 'الموصّل لم يرفع وثائقه بعد');
  res.json({ user: setUserStatus(u.id, 'active') });
});
r.post('/users/:id/suspend', requireAdmin('admin'), (req, res) => res.json({ user: setUserStatus(Number(req.params.id), 'suspended') }));
r.post('/users/:id/activate', requireAdmin('admin'), (req, res) => res.json({ user: setUserStatus(Number(req.params.id), 'active') }));

r.get('/customers', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const rows = db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id) AS orders
       FROM users u WHERE role='customer' AND (name LIKE ? OR phone LIKE ?) ORDER BY id DESC LIMIT 300`,
    )
    .all(q, q);
  res.json({ customers: rows.map((u) => ({ ...publicUser(u), orders: u.orders, createdAt: u.created_at })) });
});

// ---------------- الأسعار ----------------
r.get('/settings', (_req, res) => res.json({ settings: getSettings() }));

r.put('/settings', requireAdmin('admin'), (req, res) => {
  const allowed = ['base_fare', 'per_km', 'min_price', 'mult_letter', 'mult_small', 'mult_large', 'commission_percent', 'max_distance_km'];
  const up = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  for (const k of allowed) {
    if (req.body[k] === undefined) continue;
    const v = Number(req.body[k]);
    if (!Number.isFinite(v) || v < 0) throw new HttpError(400, `قيمة غير صحيحة: ${k}`);
    if (k === 'commission_percent' && v > 100) throw new HttpError(400, 'نسبة العمولة يجب أن تكون بين 0 و 100');
    up.run(String(v), k);
  }
  res.json({ settings: getSettings() });
});

// ---------------- الشكاوى ----------------
r.get('/complaints', (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const rows = db
    .prepare(
      `SELECT c.*, u.name AS opened_by_name, u.role AS opened_by_role, a.name AS assigned_name
       FROM complaints c JOIN users u ON u.id = c.opened_by LEFT JOIN admins a ON a.id = c.assigned_to
       ${status ? 'WHERE c.status = ?' : ''} ORDER BY (c.status='resolved'), c.id DESC LIMIT 300`,
    )
    .all(...(status ? [status] : []));
  res.json({ complaints: rows });
});

r.get('/complaints/:id', requireAdmin('admin', 'support'), (req, res) => {
  const c = db
    .prepare(
      `SELECT c.*, u.name AS opened_by_name, u.role AS opened_by_role, a.name AS assigned_name, d.name AS decided_by_name
       FROM complaints c JOIN users u ON u.id = c.opened_by
       LEFT JOIN admins a ON a.id = c.assigned_to LEFT JOIN admins d ON d.id = c.decided_by WHERE c.id = ?`,
    )
    .get(Number(req.params.id));
  if (!c) throw new HttpError(404, 'الشكوى غير موجودة');
  const order = getOrder(c.order_id);
  const access = db
    .prepare(
      `SELECT l.*, a.name AS admin_name FROM access_log l JOIN admins a ON a.id = l.admin_id
       WHERE l.order_id = ? ORDER BY l.id DESC LIMIT 100`,
    )
    .all(c.order_id);
  res.json({ complaint: c, order: orderView(order, adminViewer(req)), ...timeline(order.id), access });
});

r.post('/complaints/:id/assign', requireAdmin('admin', 'support'), (req, res) => {
  const changed = db
    .prepare("UPDATE complaints SET assigned_to = ?, status = CASE WHEN status='open' THEN 'reviewing' ELSE status END WHERE id = ?")
    .run(req.admin.id, Number(req.params.id)).changes;
  if (!changed) throw new HttpError(404, 'الشكوى غير موجودة');
  res.json({ ok: true });
});

r.post('/complaints/:id/decide', requireAdmin('admin', 'support'), (req, res) => {
  const c = db.prepare('SELECT * FROM complaints WHERE id = ?').get(Number(req.params.id));
  if (!c) throw new HttpError(404, 'الشكوى غير موجودة');
  const decision = req.body.decision;
  if (!['customer', 'courier', 'info_requested'].includes(decision)) throw new HttpError(400, 'قرار غير صحيح');
  const note = String(req.body.note || '').trim() || null;
  const status = decision === 'info_requested' ? 'reviewing' : 'resolved';
  db.prepare(
    "UPDATE complaints SET decision = ?, decision_note = ?, status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?",
  ).run(decision, note, status, req.admin.id, c.id);
  const text = {
    customer: 'قررت الإدارة الشكوى لصالح الزبون',
    courier: 'قررت الإدارة الشكوى لصالح الموصّل',
    info_requested: 'تطلب الإدارة معلومات إضافية حول الشكوى',
  }[decision];
  addSystemMessage(c.order_id, note ? `${text}: ${note}` : text);
  emitToUser(c.opened_by, 'complaint:update', { id: c.id, orderId: c.order_id, status, decision, note });
  res.json({ ok: true });
});

/**
 * رابط مؤقت للاستماع لرسالة صوتية أو تسجيل مكالمة أو رؤية صورة.
 * كل طلب يُسجل في access_log: من فتح ماذا ومتى.
 */
r.post('/media', requireAdmin(...LISTEN), (req, res) => {
  const { type, id, complaintId } = req.body;
  let file;
  let orderId;
  if (type === 'message') {
    const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(id));
    file = m?.file;
    orderId = m?.order_id;
  } else if (type === 'call') {
    const c = db.prepare('SELECT * FROM calls WHERE id = ?').get(Number(id));
    file = c?.recording_url;
    orderId = c?.order_id;
  } else if (type === 'pickup_photo') {
    const o = getOrder(Number(id));
    file = o?.pickup_photo;
    orderId = o?.id;
  } else throw new HttpError(400, 'نوع غير معروف');
  if (!file) throw new HttpError(404, 'الملف غير متوفر (ربما حُذف بعد انتهاء مدة الحفظ)');
  db.prepare('INSERT INTO access_log (admin_id, complaint_id, order_id, target_type, target_id, action) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.admin.id,
    complaintId ? Number(complaintId) : null,
    orderId,
    type,
    Number(id),
    type === 'pickup_photo' ? 'view' : 'listen',
  );
  res.json({ url: mediaUrl(file, adminViewer(req)) });
});

r.get('/access-log', requireAdmin('admin'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT l.*, a.name AS admin_name, a.username FROM access_log l JOIN admins a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 500`,
    )
    .all();
  res.json({ log: rows });
});

// ---------------- الموظفون ----------------
r.get('/staff', requireAdmin('admin'), (_req, res) => {
  res.json({ staff: db.prepare('SELECT id, username, name, role, active, created_at FROM admins ORDER BY id').all() });
});

r.post('/staff', requireAdmin('admin'), (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || String(password).length < 8 || !name || !ALL.includes(role))
    throw new HttpError(400, 'أكمل البيانات (كلمة المرور 8 أحرف على الأقل)');
  if (db.prepare('SELECT 1 FROM admins WHERE username = ?').get(username)) throw new HttpError(409, 'اسم المستخدم مستعمل');
  db.prepare('INSERT INTO admins (username, password_hash, name, role) VALUES (?, ?, ?, ?)').run(
    username,
    bcrypt.hashSync(String(password), 10),
    name,
    role,
  );
  res.status(201).json({ ok: true });
});

r.post('/staff/:id/toggle', requireAdmin('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.admin.id) throw new HttpError(400, 'لا يمكنك إيقاف حسابك');
  db.prepare('UPDATE admins SET active = 1 - active WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default r;
