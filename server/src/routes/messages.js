import { Router } from 'express';
import { db } from '../db.js';
import { HttpError, requireUser } from '../auth.js';
import { uploadAudio, mediaUrl } from '../media.js';
import { emitToOrder } from '../realtime.js';
import { participantOrder } from './orders.js';
import { pushToUser } from '../push.js';

const r = Router();
r.use(['/orders', '/messages'], requireUser());

const WRITABLE = ['accepted', 'picked_up'];

export function messageView(m, viewer) {
  const sender = m.sender_id ? db.prepare('SELECT role, name FROM users WHERE id = ?').get(m.sender_id) : null;
  const call = m.call_id ? db.prepare('SELECT status, duration FROM calls WHERE id = ?').get(m.call_id) : null;
  return {
    id: m.id,
    orderId: m.order_id,
    kind: m.kind,
    senderId: m.sender_id,
    senderRole: sender?.role ?? 'system',
    senderName: sender?.name ?? null,
    body: m.body,
    // الأطراف يسمعون الرسائل الصوتية؛ تسجيلات المكالمات للإدارة فقط
    audioUrl: m.kind === 'voice' && m.file ? mediaUrl(m.file, viewer) : null,
    purged: m.kind === 'voice' && !m.file,
    duration: m.duration,
    call,
    callId: m.call_id,
    createdAt: m.created_at,
    listenedAt: m.listened_at,
  };
}

r.get('/orders/:id/messages', (req, res) => {
  const order = participantOrder(req);
  const rows = db.prepare('SELECT * FROM messages WHERE order_id = ? ORDER BY id').all(order.id);
  res.json({
    messages: rows.map((m) => messageView(m, { kind: 'user', id: req.user.id })),
    canWrite: Boolean(order.courier_id) && WRITABLE.includes(order.status),
  });
});

function insertAndEmit(orderId, senderId, kind, body, file, duration) {
  const info = db
    .prepare('INSERT INTO messages (order_id, sender_id, kind, body, file, duration) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, senderId, kind, body, file, duration);
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  // كل مستقبل يحصل على رابط مؤقت خاص به عند جلب الرسائل؛ الحدث يحمل رابطاً صالحاً لـ 10 دقائق
  emitToOrder(orderId, 'message:new', messageView(m, { kind: 'user', id: senderId }));
  const order = db.prepare('SELECT customer_id, courier_id FROM orders WHERE id = ?').get(orderId);
  const to = senderId === order.customer_id ? order.courier_id : order.customer_id;
  const sender = db.prepare('SELECT name FROM users WHERE id = ?').get(senderId);
  if (to) pushToUser(to, { title: sender?.name ?? 'رسالة جديدة', body: kind === 'voice' ? 'رسالة صوتية' : body, data: { type: 'chat', orderId } });
  return m;
}

function assertWritable(order) {
  if (!order.courier_id || !WRITABLE.includes(order.status)) throw new HttpError(409, 'المحادثة مغلقة لهذا الطلب');
}

r.post('/orders/:id/messages', (req, res) => {
  const order = participantOrder(req);
  assertWritable(order);
  const body = String(req.body.body || '').trim().slice(0, 1000);
  if (!body) throw new HttpError(400, 'الرسالة فارغة');
  const m = insertAndEmit(order.id, req.user.id, 'text', body, null, null);
  res.status(201).json({ message: messageView(m, { kind: 'user', id: req.user.id }) });
});

r.post('/orders/:id/messages/voice', uploadAudio.single('audio'), (req, res) => {
  const order = participantOrder(req);
  assertWritable(order);
  if (!req.file) throw new HttpError(400, 'لم يصل الملف الصوتي');
  const duration = Math.min(120, Math.max(1, Math.round(Number(req.body.duration) || 1)));
  const m = insertAndEmit(order.id, req.user.id, 'voice', null, req.file.filename, duration);
  res.status(201).json({ message: messageView(m, { kind: 'user', id: req.user.id }) });
});

r.post('/messages/:mid/listened', (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.mid));
  if (!m) throw new HttpError(404, 'الرسالة غير موجودة');
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(m.order_id);
  if (order.customer_id !== req.user.id && order.courier_id !== req.user.id) throw new HttpError(403, 'غير مسموح');
  if (m.sender_id !== req.user.id && !m.listened_at) {
    db.prepare("UPDATE messages SET listened_at = datetime('now') WHERE id = ?").run(m.id);
    emitToOrder(m.order_id, 'message:listened', { id: m.id, orderId: m.order_id });
  }
  res.json({ ok: true });
});

export default r;
