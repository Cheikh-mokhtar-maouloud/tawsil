import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { config } from './config.js';
import { HttpError } from './auth.js';

const AUDIO = /^(audio\/|video\/mp4$|video\/3gpp$|application\/octet-stream$)/;
const IMAGE = /^image\//;

function makeUploader(allowed, maxMb) {
  return multer({
    storage: multer.diskStorage({
      destination: config.uploadsDir,
      filename: (_req, file, cb) => {
        const ext = (path.extname(file.originalname || '') || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
      allowed.test(file.mimetype) ? cb(null, true) : cb(new HttpError(400, 'نوع الملف غير مسموح')),
  });
}

export const uploadAudio = makeUploader(AUDIO, 10);
export const uploadImage = makeUploader(IMAGE, 8);

/** رابط مؤقت (10 دقائق) لملف صوتي أو صورة. لا يمكن فتح الملفات بدون هذا الرابط */
export function mediaUrl(file, viewer) {
  if (!file) return null;
  if (/^https?:\/\//.test(file)) return file; // تسجيل مخزن خارجياً (Agora)
  const t = jwt.sign({ f: file, v: viewer ? `${viewer.kind}:${viewer.id}` : 'anon' }, config.jwtSecret, {
    expiresIn: '10m',
  });
  return `/media/${encodeURIComponent(file)}?t=${t}`;
}

export function serveMedia(req, res, next) {
  const file = path.basename(req.params.file);
  try {
    const payload = jwt.verify(String(req.query.t || ''), config.jwtSecret);
    if (payload.f !== file) throw new Error('mismatch');
  } catch {
    return next(new HttpError(403, 'الرابط منتهي أو غير صالح'));
  }
  const full = path.join(config.uploadsDir, file);
  if (!fs.existsSync(full)) return next(new HttpError(404, 'الملف غير موجود (ربما حُذف بعد انتهاء مدة الحفظ)'));
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.sendFile(full);
}

export function deleteUpload(file) {
  if (!file || /^https?:\/\//.test(file)) return;
  fs.rm(path.join(config.uploadsDir, path.basename(file)), { force: true }, () => {});
}
