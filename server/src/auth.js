import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const signUserToken = (user) =>
  jwt.sign({ sub: user.id, kind: 'user', role: user.role }, config.jwtSecret, { expiresIn: '30d' });

export const signAdminToken = (admin) =>
  jwt.sign({ sub: admin.id, kind: 'admin', role: admin.role }, config.jwtSecret, { expiresIn: '12h' });

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/** يتحقق من مستخدم التطبيق (زبون أو موصّل) */
export function requireUser(...roles) {
  return (req, _res, next) => {
    const payload = verifyToken(bearer(req));
    if (!payload || payload.kind !== 'user') return next(new HttpError(401, 'يجب تسجيل الدخول'));
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return next(new HttpError(401, 'الحساب غير موجود'));
    if (user.status === 'suspended') return next(new HttpError(403, 'الحساب موقوف، تواصل مع الدعم'));
    if (roles.length && !roles.includes(user.role)) return next(new HttpError(403, 'غير مسموح'));
    req.user = user;
    next();
  };
}

/** يتحقق من موظف الإدارة، مع تحديد الصلاحيات */
export function requireAdmin(...roles) {
  return (req, _res, next) => {
    const payload = verifyToken(bearer(req));
    if (!payload || payload.kind !== 'admin') return next(new HttpError(401, 'يجب تسجيل الدخول'));
    const admin = db.prepare('SELECT id, username, name, role, active FROM admins WHERE id = ?').get(payload.sub);
    if (!admin || !admin.active) return next(new HttpError(401, 'الحساب غير مفعل'));
    if (roles.length && !roles.includes(admin.role)) return next(new HttpError(403, 'صلاحياتك لا تسمح بذلك'));
    req.admin = admin;
    next();
  };
}

export const publicUser = (u) =>
  u && {
    id: u.id,
    phone: u.phone,
    name: u.name,
    role: u.role,
    status: u.status,
    language: u.language,
    vehicle: u.vehicle,
    plate: u.plate,
    available: Boolean(u.available),
    rating: u.rating_count ? Math.round((u.rating_sum / u.rating_count) * 10) / 10 : null,
    hasDocuments: Boolean(u.id_doc && u.vehicle_photo),
  };
