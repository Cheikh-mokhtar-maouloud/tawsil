import { db } from './db.js';
import { config } from './config.js';
import { deleteUpload } from './media.js';

/**
 * حذف تلقائي للرسائل الصوتية والصور بعد انتهاء مدة الحفظ (RETENTION_DAYS).
 * لا يُحذف شيء ما دامت هناك شكوى غير مغلقة على الطلب،
 * وإذا أُغلقت الشكوى تبدأ المدة من تاريخ القرار.
 * ملاحظة: تسجيلات المكالمات محفوظة في تخزين Agora الخارجي؛ اضبط هناك قاعدة حذف تلقائي بنفس المدة.
 */
export function purgeExpiredMedia() {
  const days = `-${config.retentionDays} days`;
  const orders = db
    .prepare(
      `SELECT o.* FROM orders o
       WHERE o.media_purged = 0 AND o.closed_at IS NOT NULL AND o.closed_at <= datetime('now', ?)
         AND NOT EXISTS (SELECT 1 FROM complaints c WHERE c.order_id = o.id AND c.status != 'resolved')
         AND NOT EXISTS (SELECT 1 FROM complaints c WHERE c.order_id = o.id AND c.decided_at > datetime('now', ?))`,
    )
    .all(days, days);

  const purge = db.transaction((o) => {
    for (const m of db.prepare("SELECT file FROM messages WHERE order_id = ? AND file IS NOT NULL").all(o.id)) deleteUpload(m.file);
    deleteUpload(o.location_voice);
    deleteUpload(o.pickup_photo);
    db.prepare('UPDATE messages SET file = NULL WHERE order_id = ?').run(o.id);
    db.prepare('UPDATE calls SET recording_url = NULL WHERE order_id = ?').run(o.id);
    db.prepare('DELETE FROM courier_path WHERE order_id = ?').run(o.id);
    db.prepare('UPDATE orders SET location_voice = NULL, pickup_photo = NULL, media_purged = 1 WHERE id = ?').run(o.id);
  });
  for (const o of orders) purge(o);
  if (orders.length) console.log(`[retention] حُذفت ملفات ${orders.length} طلب`);
  return orders.length;
}

export function startRetentionJob() {
  purgeExpiredMedia();
  setInterval(purgeExpiredMedia, 60 * 60 * 1000).unref();
}
