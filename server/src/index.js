import http from 'node:http';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Server } from 'socket.io';
import { config, callsEnabled, recordingEnabled } from './config.js';
import { db } from './db.js';
import { HttpError, verifyToken } from './auth.js';
import { serveMedia } from './media.js';
import { setIo } from './realtime.js';
import { resumeSearching, getOrder, currentOffer } from './orders-service.js';
import { startRetentionJob } from './retention.js';
import authRoutes from './routes/auth.js';
import courierRoutes, { updateCourierLocation } from './routes/courier.js';
import orderRoutes from './routes/orders.js';
import messageRoutes from './routes/messages.js';
import callRoutes from './routes/calls.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  req.body ??= {}; // Express 5 يترك body فارغاً عندما لا يُرسل شيء
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, calls: callsEnabled(), recording: recordingEnabled() }));
app.get('/media/:file', serveMedia);
app.use('/auth', authRoutes);
app.use('/courier', courierRoutes);
app.use('/orders', orderRoutes);
app.use('/', messageRoutes);
app.use('/', callRoutes);
app.use('/admin', adminRoutes);

app.use((_req, _res, next) => next(new HttpError(404, 'المسار غير موجود')));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'الملف كبير جداً' : 'خطأ في رفع الملف' });
  }
  const status = err.status || 500;
  if (!err.status) console.error(err);
  res.status(status).json({ error: err.status ? err.message : 'حدث خطأ في الخادم', ...(err.extra || {}) });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
setIo(io);

io.use((socket, next) => {
  const payload = verifyToken(socket.handshake.auth?.token);
  if (!payload) return next(new Error('unauthorized'));
  socket.data.auth = payload;
  next();
});

io.on('connection', (socket) => {
  const { sub, kind } = socket.data.auth;
  if (kind === 'admin') socket.join('admins');
  else socket.join(`user:${sub}`);

  // الانضمام لغرفة الطلب لاستقبال الرسائل والموقع المباشر
  socket.on('order:join', (orderId, ack) => {
    const order = getOrder(Number(orderId));
    const allowed =
      order &&
      (kind === 'admin' || order.customer_id === sub || order.courier_id === sub || currentOffer(order.id)?.courierId === sub);
    if (allowed) socket.join(`order:${order.id}`);
    if (typeof ack === 'function') ack({ ok: Boolean(allowed) });
  });
  socket.on('order:leave', (orderId) => socket.leave(`order:${Number(orderId)}`));

  // الموصّل يرسل موقعه كل 10–15 ثانية أثناء العمل
  socket.on('courier:location', ({ lat, lng } = {}) => {
    if (kind !== 'user') return;
    const u = db.prepare('SELECT role, status FROM users WHERE id = ?').get(sub);
    if (u?.role === 'courier' && u.status === 'active') updateCourierLocation(sub, Number(lat), Number(lng));
  });
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] يعمل على http://localhost:${config.port}`);
  console.log(`[server] المكالمات: ${callsEnabled() ? 'مفعّلة' : 'معطّلة (أضف مفاتيح Agora في .env)'} · التسجيل: ${recordingEnabled() ? 'مفعّل' : 'معطّل'}`);
  resumeSearching();
  startRetentionJob();
});

export { app, server };
