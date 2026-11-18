import { config } from './config.js';

/**
 * إرسال رسالة SMS.
 * في وضع التطوير يطبع الرمز في الطرفية فقط.
 * للإنتاج: اربط هنا مزود رسائل يعمل في موريتانيا (واجهة HTTP عادة)،
 * مثال:
 *   await fetch(process.env.SMS_API_URL, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_API_KEY}` },
 *     body: JSON.stringify({ to: phone, text }),
 *   });
 */
export async function sendSms(phone, text) {
  if (config.isDev) {
    console.log(`[sms] إلى ${phone}: ${text}`);
    return;
  }
  throw new Error('لم يتم ربط مزود الرسائل SMS بعد — عدّل الملف src/sms.js');
}
