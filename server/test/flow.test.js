/**
 * اختبار شامل لدورة الطلب كاملة: تسجيل، موافقة الموصّل، طلب، عرض، قبول، تتبع،
 * محادثة صوتية، استلام، تسليم، تقييم، شكوى، استماع الإدارة مع سجل الوصول، وحذف الملفات بعد المدة.
 * التشغيل: npm test
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WITH_CALLS = process.argv.includes('--calls');
const PORT = WITH_CALLS ? 4101 : 4100;
const BASE = `http://localhost:${PORT}`;
const dataDir = path.join(root, 'test', 'tmp-data');
const uploadsDir = path.join(root, 'test', 'tmp-uploads');
fs.rmSync(dataDir, { recursive: true, force: true });
fs.rmSync(uploadsDir, { recursive: true, force: true });

const env = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR: dataDir,
  UPLOADS_DIR: uploadsDir,
  OFFER_TIMEOUT_SECONDS: '5',
  NODE_ENV: 'development',
  // --calls: مفاتيح وهمية لاختبار منطق المكالمات (بدون اتصال فعلي بـ Agora)
  AGORA_APP_ID: WITH_CALLS ? '0123456789abcdef0123456789abcdef' : '',
  AGORA_APP_CERTIFICATE: WITH_CALLS ? 'fedcba9876543210fedcba9876543210' : '',
  AGORA_CUSTOMER_ID: '',
};
const server = spawn('node', ['src/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const step = (name) => console.log(`✓ ${name}`) || passed++;

async function api(method, url, { token, body, form } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function waitFor(socket, event, pred = () => true, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    const h = (d) => {
      if (pred(d)) {
        clearTimeout(t);
        socket.off(event, h);
        resolve(d);
      }
    };
    socket.on(event, h);
  });
}

async function login(phone, role, name) {
  const otp = await api('POST', '/auth/request-otp', { body: { phone } });
  assert.equal(otp.status, 200, JSON.stringify(otp.data));
  assert.ok(otp.data.devCode);
  const wrong = await api('POST', '/auth/verify-otp', { body: { phone, code: '000000', role, name } });
  assert.equal(wrong.status, 400);
  const ok = await api('POST', '/auth/verify-otp', { body: { phone, code: otp.data.devCode, role, name } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  return ok.data;
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const audio = Buffer.from('fake-m4a-audio-bytes-for-test');
const file = (buf, type, name) => [new Blob([buf], { type }), name];

const sockets = [];
function connect(token) {
  const s = io(BASE, { auth: { token }, transports: ['websocket'] });
  sockets.push(s);
  return new Promise((res, rej) => {
    s.on('connect', () => res(s));
    s.on('connect_error', rej);
  });
}

try {
  for (let i = 0; i < 50; i++) {
    if (serverLog.includes('يعمل على')) break;
    await sleep(100);
  }
  assert.ok((await fetch(`${BASE}/health`)).ok);
  step('الخادم يعمل');

  assert.equal((await api('POST', '/auth/request-otp', { body: { phone: '12345' } })).status, 400);
  const customer = await login('22 33 44 55', 'customer', 'أحمد');
  assert.equal(customer.user.phone, '+22222334455');
  const courier = await login('+222 36 11 22 33', 'courier', 'محمد');
  assert.equal(courier.user.status, 'pending');
  step('تسجيل الدخول برمز التحقق (زبون وموصّل)');

  const cs = await connect(courier.token);
  const us = await connect(customer.token);
  const pending = await api('PUT', '/courier/availability', { token: courier.token, body: { available: true } });
  assert.equal(pending.status, 403);

  const docs = new FormData();
  docs.append('idDoc', ...file(png, 'image/png', 'id.png'));
  docs.append('vehiclePhoto', ...file(png, 'image/png', 'bike.png'));
  docs.append('vehicle', 'دراجة نارية');
  docs.append('plate', '1234 AA 00');
  assert.equal((await api('POST', '/courier/documents', { token: courier.token, form: docs })).status, 200);

  const admin = await api('POST', '/admin/login', { body: { username: 'admin', password: 'admin123' } });
  assert.equal(admin.status, 200);
  const at = admin.data.token;
  const as = await connect(at);
  const accountUpdate = waitFor(cs, 'account:update');
  assert.equal((await api('POST', `/admin/couriers/${courier.user.id}/approve`, { token: at })).status, 200);
  assert.equal((await accountUpdate).status, 'active');
  step('رفع وثائق الموصّل وموافقة الإدارة');

  assert.equal((await api('PUT', '/courier/availability', { token: courier.token, body: { available: true } })).status, 200);
  cs.emit('courier:location', { lat: 18.0866, lng: -15.9785 });
  await sleep(200);

  const points = { pickupLat: 18.0858, pickupLng: -15.9787, dropoffLat: 18.1001, dropoffLng: -15.9581 };
  const q = await api('POST', '/orders/quote', { token: customer.token, body: { type: 'small', ...points } });
  assert.equal(q.status, 200);
  assert.ok(q.data.price >= 60 && q.data.distanceKm > 2);
  step(`تسعير الطلب: ${q.data.distanceKm} كم = ${q.data.price} ${q.data.currency}`);

  const offerP = waitFor(cs, 'order:offer');
  const form = new FormData();
  Object.entries({
    type: 'small',
    ...points,
    pickupAddress: 'تفرغ زينة، قرب المسجد',
    dropoffAddress: 'لكصر، بجانب الصيدلية',
    recipientName: 'فاطمة',
    recipientPhone: '46 00 11 22',
    locationVoiceDuration: '14',
  }).forEach(([k, v]) => form.append(k, String(v)));
  form.append('locationVoice', ...file(audio, 'audio/m4a', 'loc.m4a'));
  const created = await api('POST', '/orders', { token: customer.token, form });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const order = created.data.order;
  assert.ok(order.deliveryCode && order.locationVoice);
  assert.equal(order.recipient.phone, '+22246001122');
  const offer = await offerP;
  assert.equal(offer.order.id, order.id);
  assert.equal(offer.order.deliveryCode, undefined, 'الموصّل لا يرى رمز التسليم');
  assert.equal(offer.order.recipient.phone, null, 'الموصّل لا يرى رقم المستلم قبل الاستلام');
  step('إنشاء طلب مع وصف صوتي ووصول العرض لأقرب موصّل');

  const custUpdate = waitFor(us, 'order:update', (o) => o.status === 'accepted');
  const acc = await api('POST', `/orders/${order.id}/accept`, { token: courier.token });
  assert.equal(acc.status, 200);
  const accepted = await custUpdate;
  assert.equal(accepted.courier.name, 'محمد');
  assert.equal(accepted.courier.phone, undefined, 'رقم الموصّل مخفي عن الزبون');
  step('قبول الموصّل للطلب وإشعار الزبون (الأرقام مخفية)');

  await new Promise((r) => us.emit('order:join', order.id, r));
  await new Promise((r) => cs.emit('order:join', order.id, r));
  const locP = waitFor(us, 'courier:location');
  cs.emit('courier:location', { lat: 18.087, lng: -15.978 });
  const loc = await locP;
  assert.equal(loc.lat, 18.087);
  step('التتبع المباشر لموقع الموصّل');

  const msgP = waitFor(us, 'message:new', (m) => m.kind === 'text');
  assert.equal((await api('POST', `/orders/${order.id}/messages`, { token: courier.token, body: { body: 'أنا في الطريق' } })).status, 201);
  assert.equal((await msgP).body, 'أنا في الطريق');
  const vf = new FormData();
  vf.append('audio', ...file(audio, 'audio/m4a', 'v.m4a'));
  vf.append('duration', '8');
  const voice = await api('POST', `/orders/${order.id}/messages/voice`, { token: customer.token, form: vf });
  assert.equal(voice.status, 201);
  const msgs = await api('GET', `/orders/${order.id}/messages`, { token: courier.token });
  const vm = msgs.data.messages.find((m) => m.id === voice.data.message.id);
  const audioRes = await fetch(BASE + vm.audioUrl);
  assert.equal(audioRes.status, 200);
  assert.equal((await fetch(BASE + vm.audioUrl.replace(/t=.*/, 't=bad'))).status, 403);
  assert.equal((await api('POST', `/messages/${vm.id}/listened`, { token: courier.token })).status, 200);
  step('المحادثة: رسالة نصية + رسالة صوتية + روابط مؤقتة محمية');

  if (!WITH_CALLS) {
    const call = await api('POST', `/orders/${order.id}/calls`, { token: customer.token });
    assert.equal(call.status, 503);
    assert.equal(call.data.fallback, 'voice');
    step('المكالمات بدون مفاتيح Agora: ترجع اقتراح الرسالة الصوتية');
  } else {
    const incomingP = waitFor(cs, 'call:incoming');
    const call = await api('POST', `/orders/${order.id}/calls`, { token: customer.token });
    assert.equal(call.status, 201, JSON.stringify(call.data));
    assert.ok(call.data.token.length > 50);
    const incoming = await incomingP;
    assert.equal(incoming.callId, call.data.callId);
    assert.equal(incoming.from.name, 'أحمد');
    assert.equal((await api('POST', `/orders/${order.id}/calls`, { token: courier.token })).status, 409);
    const answeredP = waitFor(us, 'call:answered');
    assert.equal((await api('POST', `/calls/${incoming.callId}/answer`, { token: courier.token })).status, 200);
    await answeredP;
    await sleep(1100);
    const endedP = waitFor(cs, 'call:ended');
    const callMsgP = waitFor(us, 'message:new', (m) => m.kind === 'call');
    assert.equal((await api('POST', `/calls/${incoming.callId}/end`, { token: customer.token })).status, 200);
    assert.equal((await endedP).status, 'ended');
    const cm = await callMsgP;
    assert.ok(cm.call.duration >= 1);
    // مكالمة لا يرد عليها: يلغيها المتصل فتسجل فائتة
    const c2 = await api('POST', `/orders/${order.id}/calls`, { token: courier.token });
    await api('POST', `/calls/${c2.data.callId}/end`, { token: courier.token });
    const after = await api('GET', `/orders/${order.id}/messages`, { token: customer.token });
    assert.equal(after.data.messages.filter((m) => m.kind === 'call').map((m) => m.call.status).join(','), 'ended,missed');
    step('المكالمات: رنين، منع مكالمتين معاً، رد، إنهاء بالمدة، ومكالمة فائتة');
  }

  assert.equal((await api('POST', `/orders/${order.id}/deliver`, { token: courier.token, body: { code: order.deliveryCode } })).status, 409);
  const pf = new FormData();
  pf.append('photo', ...file(png, 'image/png', 'p.png'));
  assert.equal((await api('POST', `/orders/${order.id}/pickup`, { token: courier.token, form: pf })).status, 200);
  const afterPickup = await api('GET', `/orders/${order.id}`, { token: courier.token });
  assert.equal(afterPickup.data.order.recipient.phone, '+22246001122');
  assert.equal((await api('POST', `/orders/${order.id}/cancel`, { token: customer.token })).status, 409);
  assert.equal((await api('POST', `/orders/${order.id}/deliver`, { token: courier.token, body: { code: '0000' } })).status, 400);
  assert.equal((await api('POST', `/orders/${order.id}/deliver`, { token: courier.token, body: { code: order.deliveryCode } })).status, 200);
  step('الاستلام بصورة، رفض رمز خاطئ، التسليم بالرمز الصحيح');

  assert.equal((await api('POST', `/orders/${order.id}/messages`, { token: courier.token, body: { body: 'x' } })).status, 409);
  assert.equal((await api('POST', `/orders/${order.id}/rate`, { token: customer.token, body: { rating: 5 } })).status, 200);
  const earnings = await api('GET', '/courier/earnings', { token: courier.token });
  assert.equal(earnings.data.today.count, 1);
  assert.equal(earnings.data.cashDueToCompany, order.price - offer.order.courierFee);
  step('إغلاق المحادثة بعد التسليم، التقييم، وأرباح الموصّل');

  const compP = waitFor(as, 'complaint:new');
  const comp = await api('POST', `/orders/${order.id}/complaints`, {
    token: customer.token,
    body: { reason: 'لم يصل الطرد', details: 'المستلم يقول لم يستلم' },
  });
  assert.equal(comp.status, 201);
  await compP;
  const list = await api('GET', '/admin/complaints', { token: at });
  assert.equal(list.data.complaints.length, 1);
  const detail = await api('GET', `/admin/complaints/${comp.data.complaintId}`, { token: at });
  assert.ok(detail.data.messages.length >= 4);
  assert.ok(detail.data.path.length >= 1);
  const voiceMsg = detail.data.messages.find((m) => m.kind === 'voice' && m.hasAudio);
  const media = await api('POST', '/admin/media', {
    token: at,
    body: { type: 'message', id: voiceMsg.id, complaintId: comp.data.complaintId },
  });
  assert.equal((await fetch(BASE + media.data.url)).status, 200);
  const log = await api('GET', '/admin/access-log', { token: at });
  assert.equal(log.data.log.length, 1);
  assert.equal(log.data.log[0].action, 'listen');
  const decide = await api('POST', `/admin/complaints/${comp.data.complaintId}/decide`, {
    token: at,
    body: { decision: 'courier', note: 'التسليم مؤكد برمز المستلم' },
  });
  assert.equal(decide.status, 200);
  step('الشكوى: عرض السجل الكامل، استماع الإدارة مع تسجيل الوصول، والقرار');

  // موظف دعم لا يستطيع تغيير الأسعار، والمحاسب لا يستطيع الاستماع
  assert.equal((await api('POST', '/admin/staff', { token: at, body: { username: 'acc', password: 'password1', name: 'محاسب', role: 'accountant' } })).status, 201);
  const acc2 = await api('POST', '/admin/login', { body: { username: 'acc', password: 'password1' } });
  assert.equal((await api('POST', '/admin/media', { token: acc2.data.token, body: { type: 'message', id: voiceMsg.id } })).status, 403);
  assert.equal((await api('PUT', '/admin/settings', { token: acc2.data.token, body: { per_km: 1 } })).status, 403);
  assert.equal((await api('POST', `/admin/orders/${order.id}/settle-cash`, { token: acc2.data.token })).status, 200);
  step('صلاحيات الموظفين: المحاسب يسوّي النقد ولا يستمع للتسجيلات');

  // طلب ثانٍ: الموصّل يرفض، ثم الزبون يلغي
  const offer2P = waitFor(cs, 'order:offer');
  const form2 = new FormData();
  Object.entries({ type: 'letter', ...points, pickupAddress: 'أ', dropoffAddress: 'ب', recipientName: 'س', recipientPhone: '32000000' }).forEach(
    ([k, v]) => form2.append(k, String(v)),
  );
  const o2 = await api('POST', '/orders', { token: customer.token, form: form2 });
  await offer2P;
  assert.equal((await api('POST', `/orders/${o2.data.order.id}/reject`, { token: courier.token })).status, 200);
  assert.equal((await api('POST', `/orders/${o2.data.order.id}/accept`, { token: courier.token })).status, 409);
  assert.equal((await api('POST', `/orders/${o2.data.order.id}/cancel`, { token: customer.token })).status, 200);
  step('رفض العرض لا يسمح بقبوله لاحقاً، وإلغاء الزبون');

  const stats = await api('GET', '/admin/stats', { token: at });
  assert.equal(stats.data.today.orders, 2);
  assert.equal(stats.data.today.delivered, 1);
  step('مؤشرات لوحة الإدارة');
} catch (e) {
  console.error('✗ فشل:', e);
  process.exitCode = 1;
} finally {
  sockets.forEach((s) => s.close());
  server.kill();
}

if (!process.exitCode) {
  // الحذف التلقائي: نرجع تاريخ الإغلاق والقرار 61 يوماً للوراء ثم نشغل مهمة الحذف
  await sleep(300);
  const out = execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `const { db } = await import('./src/db.js');
       db.prepare("UPDATE orders SET closed_at = datetime('now','-61 days')").run();
       db.prepare("UPDATE complaints SET decided_at = datetime('now','-61 days')").run();
       const { purgeExpiredMedia } = await import('./src/retention.js');
       const n = purgeExpiredMedia();
       const left = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE file IS NOT NULL').get().n;
       console.log(JSON.stringify({ n, left }));`,
    ],
    { cwd: root, env },
  ).toString();
  const res = JSON.parse(out.trim().split('\n').pop());
  assert.equal(res.left, 0);
  await sleep(200);
  assert.equal(fs.readdirSync(uploadsDir).filter((f) => /m4a$/.test(f)).length, 0);
  step('الحذف التلقائي للتسجيلات بعد انتهاء مدة الحفظ');
  console.log(`\nنجحت كل الاختبارات (${passed})`);
}
fs.rmSync(dataDir, { recursive: true, force: true });
fs.rmSync(uploadsDir, { recursive: true, force: true });
