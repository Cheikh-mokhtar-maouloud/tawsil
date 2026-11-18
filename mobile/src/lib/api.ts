import * as SecureStore from 'expo-secure-store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.10:4000').replace(/\/$/, '');

const TOKEN_KEY = 'tawsil_token';
let token: string | null = null;

export const tokenStore = {
  get: () => token,
  load: async () => (token = await SecureStore.getItemAsync(TOKEN_KEY)),
  save: async (t: string) => {
    token = t;
    await SecureStore.setItemAsync(TOKEN_KEY, t);
  },
  clear: async () => {
    token = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** ملف محلي للرفع (صوت أو صورة) */
export type UploadFile = { uri: string; name: string; type: string };

type Options = {
  method?: string;
  body?: unknown;
  /** حقول نصية + ملفات تُرسل multipart */
  form?: Record<string, string | number | UploadFile | undefined | null>;
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;

  if (opts.form) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(opts.form)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'object') fd.append(k, v as unknown as Blob); // React Native يقبل {uri, name, type}
      else fd.append(k, String(v));
    }
    body = fd;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: opts.method || (body ? 'POST' : 'GET'), headers, body });
  } catch {
    throw new ApiError(0, `تعذر الاتصال بالخادم. تأكد من الإنترنت ومن العنوان ${API_URL}`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, data.error || 'حدث خطأ، حاول مرة أخرى', data);
  return data as T;
}

export const mediaUrl = (url: string | null | undefined) => (!url ? null : /^https?:/.test(url) ? url : API_URL + url);

export const audioFile = (uri: string): UploadFile => {
  const ext = (uri.split('.').pop() || 'm4a').toLowerCase();
  return { uri, name: `voice.${ext}`, type: ext === 'wav' ? 'audio/wav' : ext === 'webm' ? 'audio/webm' : 'audio/m4a' };
};

export const imageFile = (uri: string, name = 'photo.jpg'): UploadFile => ({ uri, name, type: 'image/jpeg' });
