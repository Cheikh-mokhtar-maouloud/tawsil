import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, signUserToken, requireUser, publicUser } from '../auth.js';
import { sendSms } from '../sms.js';

const r = Router();

/** أرقام موريتانيا: 8 أرقام تبدأ بـ 2 أو 3 أو 4، مع أو بدون +222 */
export function normalizePhone(input) {
  let d = String(input || '').replace(/[^\d]/g, '');
  if (d.startsWith('00222')) d = d.slice(5);
  else if (d.startsWith('222') && d.length === 11) d = d.slice(3);
  if (!/^[234]\d{7}$/.test(d)) return null;
  return `+222${d}`;
}

r.post('/request-otp', async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) throw new HttpError(400, 'رقم الهاتف غير صحيح (8 أرقام تبدأ بـ 2 أو 3 أو 4)');
  const existing = db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone);
  if (existing && existing.expires_at - 4 * 60_000 > Date.now()) {
    throw new HttpError(429, 'انتظر دقيقة قبل طلب رمز جديد');
  }
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare(
    'INSERT INTO otps (phone, code, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0',
  ).run(phone, code, Date.now() + 5 * 60_000);
  await sendSms(phone, `رمز الدخول: ${code}`);
  const user = db.prepare('SELECT role FROM users WHERE phone = ?').get(phone);
  res.json({ sent: true, phone, isNewUser: !user, role: user?.role ?? null, ...(config.isDev ? { devCode: code } : {}) });
});

r.post('/verify-otp', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  const otp = phone && db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone);
  if (!otp || otp.expires_at < Date.now()) throw new HttpError(400, 'الرمز منتهي، اطلب رمزاً جديداً');
  if (otp.attempts >= 5) throw new HttpError(429, 'محاولات كثيرة، اطلب رمزاً جديداً');
  if (otp.code !== code) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone);
    throw new HttpError(400, 'الرمز غير صحيح');
  }

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    const role = req.body.role;
    const name = String(req.body.name || '').trim();
    if (!['customer', 'courier'].includes(role)) throw new HttpError(400, 'اختر نوع الحساب: زبون أو موصّل');
    if (name.length < 2) throw new HttpError(400, 'اكتب اسمك');
    const status = role === 'courier' ? 'pending' : 'active';
    const info = db.prepare('INSERT INTO users (phone, name, role, status) VALUES (?, ?, ?, ?)').run(phone, name, role, status);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  db.prepare('DELETE FROM otps WHERE phone = ?').run(phone);
  res.json({ token: signUserToken(user), user: publicUser(user) });
});

r.get('/me', requireUser(), (req, res) => res.json({ user: publicUser(req.user) }));

r.put('/me', requireUser(), (req, res) => {
  const { name, language, pushToken } = req.body;
  if (name !== undefined && String(name).trim().length >= 2)
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(name).trim(), req.user.id);
  if (['ar', 'fr'].includes(language)) db.prepare('UPDATE users SET language = ? WHERE id = ?').run(language, req.user.id);
  if (pushToken !== undefined) db.prepare('UPDATE users SET push_token = ? WHERE id = ?').run(pushToken || null, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

export default r;
