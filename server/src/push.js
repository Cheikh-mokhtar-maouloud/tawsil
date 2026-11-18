import { db } from './db.js';
import { isUserOnline } from './realtime.js';

/**
 * إشعار للهاتف عبر خدمة Expo Push عندما يكون التطبيق مغلقاً أو في الخلفية.
 * التطبيق يرسل رمزه (pushToken) بعد تسجيل الدخول.
 */
export async function pushToUser(userId, { title, body, data = {} }, { onlyIfOffline = true } = {}) {
  if (onlyIfOffline && isUserOnline(userId)) return;
  const u = db.prepare('SELECT push_token FROM users WHERE id = ?').get(userId);
  if (!u?.push_token?.startsWith('ExponentPushToken')) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: u.push_token, title, body, data, sound: 'default', priority: 'high', channelId: 'default' }),
    });
  } catch (e) {
    console.error('[push]', e.message);
  }
}
