/**
 * المكالمات داخل التطبيق عبر Agora + التسجيل السحابي (Cloud Recording).
 * التسجيل يتم على خوادم Agora ويُحفظ مباشرة في حاوية التخزين (S3 أو ما يشابهه)،
 * فلا يحتاج هاتف الزبون أو الموصّل لتسجيل أي شيء.
 *
 * المرجع: https://docs.agora.io/en/cloud-recording/reference/restful-api
 */
import agoraToken from 'agora-token';
import { config, callsEnabled, recordingEnabled } from './config.js';

const { RtcTokenBuilder, RtcRole } = agoraToken;
const API = 'https://api.agora.io/v1/apps';
const TOKEN_TTL = 60 * 60; // ساعة

export const RECORDER_UID_BASE = 900_000_000;

export function rtcToken(channel, uid) {
  if (!callsEnabled()) throw new Error('Agora غير مفعّل');
  return RtcTokenBuilder.buildTokenWithUid(
    config.agora.appId,
    config.agora.appCertificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    TOKEN_TTL,
    TOKEN_TTL,
  );
}

async function agoraRequest(urlPath, body) {
  const auth = Buffer.from(`${config.agora.customerId}:${config.agora.customerSecret}`).toString('base64');
  const res = await fetch(`${API}/${config.agora.appId}/cloud_recording/${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Agora ${urlPath}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

/** يبدأ تسجيل المكالمة (صوت فقط، الطرفان في ملف واحد) */
export async function startRecording(channel, recorderUid, orderId) {
  if (!recordingEnabled()) return null;
  const uid = String(recorderUid);
  const { resourceId } = await agoraRequest('acquire', {
    cname: channel,
    uid,
    clientRequest: { resourceExpiredHour: 24, scene: 0 },
  });
  const s = config.agora.storage;
  const { sid } = await agoraRequest(`resourceid/${resourceId}/mode/mix/start`, {
    cname: channel,
    uid,
    clientRequest: {
      token: rtcToken(channel, recorderUid),
      recordingConfig: { channelType: 0, streamTypes: 0, maxIdleTime: 30 },
      recordingFileConfig: { avFileType: ['hls', 'mp4'] },
      storageConfig: {
        vendor: s.vendor,
        region: s.region,
        bucket: s.bucket,
        accessKey: s.accessKey,
        secretKey: s.secretKey,
        fileNamePrefix: ['calls', `order${orderId}`],
      },
    },
  });
  return { resourceId, sid };
}

/** يوقف التسجيل ويرجع رابط الملف في التخزين */
export async function stopRecording(channel, recorderUid, resourceId, sid) {
  if (!recordingEnabled() || !resourceId || !sid) return null;
  const data = await agoraRequest(`resourceid/${resourceId}/sid/${sid}/mode/mix/stop`, {
    cname: channel,
    uid: String(recorderUid),
    clientRequest: {},
  });
  const list = data?.serverResponse?.fileList;
  const names = Array.isArray(list) ? list.map((f) => f.fileName) : typeof list === 'string' ? [list] : [];
  const file = names.find((n) => n.endsWith('.mp4')) || names.find((n) => n.endsWith('.m3u8')) || names[0];
  if (!file) return null;
  const base = config.agora.storage.publicUrl.replace(/\/$/, '');
  return base ? `${base}/${file}` : file;
}
