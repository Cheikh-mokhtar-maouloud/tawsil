/**
 * بيانات تجريبية لتجربة لوحة الإدارة والتطبيق: زبائن، موصّلون، طلبات بحالات مختلفة،
 * رسائل صوتية، مكالمة، وشكوى مفتوحة.
 * التشغيل: npm run seed   (يمسح البيانات السابقة أولاً)
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

const dbFile = path.join(config.dataDir, process.env.DB_FILE || 'tawsil.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
const { db } = await import('../src/db.js');

// ملف صوتي صالح (ثانية صمت بصيغة WAV) حتى تعمل أزرار التشغيل
function silentWav(seconds) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b;
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const file = (name, buf) => {
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  return name;
};

const user = (phone, name, role, extra = {}) => {
  const info = db
    .prepare(
      `INSERT INTO users (phone, name, role, status, vehicle, plate, id_doc, vehicle_photo, available, lat, lng, location_at, rating_sum, rating_count)
       VALUES (@phone, @name, @role, @status, @vehicle, @plate, @id_doc, @vehicle_photo, @available, @lat, @lng, @location_at, @rating_sum, @rating_count)`,
    )
    .run({
      phone,
      name,
      role,
      status: 'active',
      vehicle: null,
      plate: null,
      id_doc: null,
      vehicle_photo: null,
      available: 0,
      lat: null,
      lng: null,
      location_at: null,
      rating_sum: 0,
      rating_count: 0,
      ...extra,
    });
  return Number(info.lastInsertRowid);
};

const now = "datetime('now')";
const docs = () => ({ id_doc: file(`seed-id-${Math.random().toString(36).slice(2)}.png`, png), vehicle_photo: file(`seed-bike-${Math.random().toString(36).slice(2)}.png`, png) });

const c1 = user('+22222334455', 'أحمد ولد محمد', 'customer');
const c2 = user('+22233445566', 'مريم بنت سيدي', 'customer');
const k1 = user('+22236112233', 'محمد الأمين', 'courier', {
  vehicle: 'دراجة نارية', plate: '1234 AA 00', ...docs(), available: 1, lat: 18.0866, lng: -15.9785, location_at: new Date().toISOString().slice(0, 19).replace('T', ' '), rating_sum: 23, rating_count: 5,
});
const k2 = user('+22246778899', 'سيدي محمد', 'courier', {
  vehicle: 'سيارة', plate: '5678 AB 00', ...docs(), available: 1, lat: 18.0735, lng: -15.9582, location_at: new Date().toISOString().slice(0, 19).replace('T', ' '), rating_sum: 9, rating_count: 2,
});
user('+22244001122', 'عبد الله', 'courier', { status: 'pending', vehicle: 'دراجة نارية', plate: '9012 AC 00', ...docs() });

const order = (o) => {
  const info = db
    .prepare(
      `INSERT INTO orders (customer_id, courier_id, type, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
        recipient_name, recipient_phone, distance_km, price, courier_fee, status, delivery_code, pickup_photo, location_voice, location_voice_duration,
        created_at, accepted_at, picked_up_at, delivered_at, closed_at, rating)
       VALUES (@customer_id, @courier_id, @type, @pickup_address, @pickup_lat, @pickup_lng, @dropoff_address, @dropoff_lat, @dropoff_lng,
        @recipient_name, @recipient_phone, @distance_km, @price, @courier_fee, @status, @delivery_code, @pickup_photo, @location_voice, @location_voice_duration,
        datetime('now', @ago), @accepted_at, @picked_up_at, @delivered_at, @closed_at, @rating)`,
    )
    .run({
      courier_id: null,
      type: 'letter',
      pickup_address: 'تفرغ زينة، قرب المسجد',
      pickup_lat: 18.0858,
      pickup_lng: -15.9787,
      dropoff_address: 'لكصر، بجانب الصيدلية',
      dropoff_lat: 18.1001,
      dropoff_lng: -15.9581,
      recipient_name: 'فاطمة',
      recipient_phone: '+22246001122',
      distance_km: 3.5,
      price: 105,
      courier_fee: 84,
      delivery_code: '4821',
      pickup_photo: null,
      location_voice: null,
      location_voice_duration: null,
      accepted_at: null,
      picked_up_at: null,
      delivered_at: null,
      closed_at: null,
      rating: null,
      ...o,
    });
  return Number(info.lastInsertRowid);
};
const msg = (orderId, sender, kind, body, extra = {}) =>
  db
    .prepare(
      `INSERT INTO messages (order_id, sender_id, kind, body, file, duration, call_id, created_at, listened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?), ?)`,
    )
    .run(orderId, sender, kind, body, extra.file ?? null, extra.duration ?? null, extra.callId ?? null, extra.ago, extra.listened ?? null);

// طلبات مسلّمة خلال الأيام الماضية (للرسم البياني والنقد)
for (let d = 1; d <= 12; d++) {
  for (let i = 0; i < (d % 4) + 1; i++) {
    const at = `datetime('now','-${d} days')`;
    const id = order({
      customer_id: i % 2 ? c1 : c2,
      courier_id: i % 2 ? k1 : k2,
      type: ['letter', 'small', 'large'][i % 3],
      status: 'delivered',
      ago: `-${d} days`,
      price: 105 + i * 20,
      courier_fee: 84 + i * 16,
      rating: 4 + (i % 2),
    });
    db.prepare(`UPDATE orders SET accepted_at = ${at}, picked_up_at = ${at}, delivered_at = ${at}, closed_at = ${at}, cash_settled = ? WHERE id = ?`).run(d > 3 ? 1 : 0, id);
  }
}

// طلب يبحث عن موصّل الآن
order({ customer_id: c2, type: 'small', status: 'searching', ago: '-1 minutes', pickup_address: 'السوق الكبير', pickup_lat: 18.0889, pickup_lng: -15.9711 });

// طلب جارٍ مع محادثة
const live = order({ customer_id: c1, courier_id: k2, status: 'picked_up', type: 'small', ago: '-25 minutes', pickup_photo: file('seed-pickup-live.png', png) });
db.prepare(`UPDATE orders SET accepted_at = datetime('now','-22 minutes'), picked_up_at = datetime('now','-12 minutes') WHERE id = ?`).run(live);
msg(live, k2, 'text', 'استلمت الطرد، أنا في الطريق', { ago: '-11 minutes' });

// طلب مسلّم اليوم وعليه شكوى: رسائل صوتية + مكالمة
const disputed = order({
  customer_id: c1,
  courier_id: k1,
  status: 'delivered',
  ago: '-90 minutes',
  pickup_photo: file('seed-pickup.png', png),
  location_voice: file('seed-loc.wav', silentWav(3)),
  location_voice_duration: 3,
});
db.prepare(
  `UPDATE orders SET accepted_at = datetime('now','-88 minutes'), picked_up_at = datetime('now','-78 minutes'),
   delivered_at = datetime('now','-50 minutes'), closed_at = datetime('now','-50 minutes') WHERE id = ?`,
).run(disputed);
for (let i = 0; i < 6; i++)
  db.prepare("INSERT INTO courier_path (order_id, lat, lng, at) VALUES (?, ?, ?, datetime('now', ?))").run(
    disputed, 18.0858 + i * 0.0028, -15.9787 + i * 0.0041, `-${78 - i * 5} minutes`,
  );
msg(disputed, c1, 'voice', 'وصف المكان', { file: file('seed-v1.wav', silentWav(3)), duration: 3, ago: '-90 minutes', listened: "x" });
msg(disputed, null, 'system', 'قبل محمد الأمين الطلب وهو في الطريق للاستلام', { ago: '-88 minutes' });
msg(disputed, null, 'system', 'تم استلام الشحنة، الموصّل في الطريق للتسليم', { ago: '-78 minutes' });
msg(disputed, k1, 'text', 'استلمت الطرد، أنا في الطريق الآن', { ago: '-77 minutes' });
const call = db
  .prepare(
    `INSERT INTO calls (order_id, caller_id, callee_id, channel, status, started_at, answered_at, ended_at, duration, recording_url)
     VALUES (?, ?, ?, 'seed', 'ended', datetime('now','-70 minutes'), datetime('now','-70 minutes'), datetime('now','-68 minutes'), 102, ?)`,
  )
  .run(disputed, k1, c1, file('seed-call.wav', silentWav(4)));
msg(disputed, k1, 'call', 'مكالمة مسجلة', { callId: Number(call.lastInsertRowid), duration: 102, ago: '-68 minutes' });
msg(disputed, k1, 'voice', null, { file: file('seed-v2.wav', silentWav(2)), duration: 2, ago: '-60 minutes' });
msg(disputed, null, 'system', 'تم التسليم بنجاح', { ago: '-50 minutes' });
db.prepare("INSERT INTO complaints (order_id, opened_by, reason, details, created_at) VALUES (?, ?, ?, ?, datetime('now','-40 minutes'))").run(
  disputed, c1, 'لم يصل الطرد', 'المستلمة تقول إنها لم تستلم شيئاً',
);
db.prepare("UPDATE messages SET listened_at = datetime('now','-80 minutes') WHERE listened_at = 'x'").run();

console.log('[seed] تمت إضافة البيانات التجريبية');
console.log('  الإدارة: admin / admin123');
console.log('  زبون: 22334455 · موصّل: 36112233 (رمز الدخول يظهر في طرفية الخادم)');
