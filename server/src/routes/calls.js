import { Router } from 'express';
import { db } from '../db.js';
import { config, callsEnabled, recordingEnabled } from '../config.js';
import { HttpError, requireUser } from '../auth.js';
import { emitToUser, emitToOrder } from '../realtime.js';
import { rtcToken, startRecording, stopRecording, RECORDER_UID_BASE } from '../agora.js';
import { participantOrder } from './orders.js';
import { messageView } from './messages.js';
import { pushToUser } from '../push.js';

const r = Router();
r.use(['/orders', '/calls'], requireUser());

const RING_TIMEOUT_MS = 40_000;
const ringTimers = new Map();

r.get('/calls/config', (_req, res) => {
  res.json({ enabled: callsEnabled(), recording: recordingEnabled(), appId: callsEnabled() ? config.agora.appId : null });
});

function getCall(req) {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(Number(req.params.cid));
  if (!call) throw new HttpError(404, 'المكالمة غير موجودة');
  if (call.caller_id !== req.user.id && call.callee_id !== req.user.id) throw new HttpError(403, 'غير مسموح');
  return call;
}

function finishCall(call, status) {
  clearTimeout(ringTimers.get(call.id));
  ringTimers.delete(call.id);
  const fresh = db.prepare('SELECT * FROM calls WHERE id = ?').get(call.id);
  if (['ended', 'missed', 'declined', 'failed'].includes(fresh.status)) return fresh;
  const duration = fresh.answered_at
    ? Math.max(0, Math.round((Date.now() - new Date(fresh.answered_at + 'Z').getTime()) / 1000))
    : 0;
  db.prepare("UPDATE calls SET status = ?, ended_at = datetime('now'), duration = ? WHERE id = ?").run(status, duration, call.id);

  const label = { ended: 'مكالمة مسجلة', missed: 'مكالمة فائتة', declined: 'مكالمة مرفوضة', failed: 'تعذر الاتصال' }[status];
  const info = db
    .prepare("INSERT INTO messages (order_id, sender_id, kind, body, duration, call_id) VALUES (?, ?, 'call', ?, ?, ?)")
    .run(fresh.order_id, fresh.caller_id, label, duration, fresh.id);
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  emitToOrder(fresh.order_id, 'message:new', messageView(m, null));

  for (const uid of [fresh.caller_id, fresh.callee_id]) emitToUser(uid, 'call:ended', { callId: fresh.id, status });

  if (fresh.recording_sid) {
    stopRecording(fresh.channel, fresh.recording_uid, fresh.recording_resource_id, fresh.recording_sid)
      .then((url) => url && db.prepare('UPDATE calls SET recording_url = ? WHERE id = ?').run(url, fresh.id))
      .catch((e) => console.error('[agora] stop', e.message));
  }
  return db.prepare('SELECT * FROM calls WHERE id = ?').get(call.id);
}

r.post('/orders/:id/calls', (req, res) => {
  if (!callsEnabled()) throw new HttpError(503, 'المكالمات غير مفعلة حالياً، أرسل رسالة صوتية بدلاً منها', { fallback: 'voice' });
  const order = participantOrder(req);
  if (!order.courier_id || !['accepted', 'picked_up'].includes(order.status)) throw new HttpError(409, 'الاتصال متاح أثناء التوصيل فقط');
  const busy = db.prepare("SELECT id FROM calls WHERE order_id = ? AND status IN ('ringing','active')").get(order.id);
  if (busy) throw new HttpError(409, 'هناك مكالمة جارية بالفعل');

  const calleeId = req.user.id === order.customer_id ? order.courier_id : order.customer_id;
  const channel = `order${order.id}-${Date.now()}`;
  const info = db.prepare('INSERT INTO calls (order_id, caller_id, callee_id, channel) VALUES (?, ?, ?, ?)').run(
    order.id,
    req.user.id,
    calleeId,
    channel,
  );
  const callId = Number(info.lastInsertRowid);

  emitToUser(calleeId, 'call:incoming', {
    callId,
    orderId: order.id,
    channel,
    appId: config.agora.appId,
    uid: calleeId,
    token: rtcToken(channel, calleeId),
    from: { name: req.user.name, role: req.user.role },
  });
  pushToUser(
    calleeId,
    { title: 'مكالمة واردة', body: `${req.user.name} يتصل بك بخصوص طلب #${order.id}`, data: { type: 'call', orderId: order.id, callId } },
    { onlyIfOffline: false },
  );
  ringTimers.set(
    callId,
    setTimeout(() => finishCall({ id: callId }, 'missed'), RING_TIMEOUT_MS),
  );

  res.status(201).json({
    callId,
    channel,
    appId: config.agora.appId,
    uid: req.user.id,
    token: rtcToken(channel, req.user.id),
    recording: recordingEnabled(),
  });
});

r.post('/calls/:cid/answer', async (req, res) => {
  const call = getCall(req);
  if (call.callee_id !== req.user.id) throw new HttpError(403, 'غير مسموح');
  if (call.status !== 'ringing') throw new HttpError(409, 'انتهت المكالمة');
  clearTimeout(ringTimers.get(call.id));
  ringTimers.delete(call.id);
  db.prepare("UPDATE calls SET status = 'active', answered_at = datetime('now') WHERE id = ?").run(call.id);
  emitToUser(call.caller_id, 'call:answered', { callId: call.id });
  res.json({ ok: true });

  // بدء التسجيل على خوادم Agora بعد الرد
  const recorderUid = RECORDER_UID_BASE + call.id;
  try {
    const rec = await startRecording(call.channel, recorderUid, call.order_id);
    if (rec) {
      db.prepare('UPDATE calls SET recording_resource_id = ?, recording_sid = ?, recording_uid = ? WHERE id = ?').run(
        rec.resourceId,
        rec.sid,
        recorderUid,
        call.id,
      );
    }
  } catch (e) {
    console.error('[agora] start', e.message);
  }
});

r.post('/calls/:cid/decline', (req, res) => {
  const call = getCall(req);
  res.json({ call: finishCall(call, 'declined') });
});

r.post('/calls/:cid/end', (req, res) => {
  const call = getCall(req);
  res.json({ call: finishCall(call, call.status === 'ringing' ? 'missed' : 'ended') });
});

export default r;
