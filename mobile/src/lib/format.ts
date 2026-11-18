import type { OrderStatus, OrderType } from './types';

export const TYPE_LABEL: Record<OrderType, string> = { letter: 'رسالة', small: 'طرد صغير', large: 'طرد كبير' };

export const STATUS_LABEL: Record<OrderStatus, string> = {
  searching: 'نبحث عن موصّل',
  accepted: 'الموصّل في الطريق للاستلام',
  picked_up: 'الموصّل في الطريق إليك',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  no_courier: 'لم يتوفر موصّل',
};

export const COURIER_STATUS_LABEL: Record<OrderStatus, string> = {
  searching: 'عرض جديد',
  accepted: 'اذهب للاستلام',
  picked_up: 'اذهب للتسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  no_courier: 'منتهٍ',
};

export const isActive = (s: OrderStatus) => s === 'searching' || s === 'accepted' || s === 'picked_up';

export const money = (n: number | null | undefined) => `${(n ?? 0).toLocaleString('en')} أوقية`;

export const duration = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const toDate = (s: string) => new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));

export const time = (s: string | null | undefined) => {
  if (!s) return '';
  const d = toDate(s);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const dateTime = (s: string | null | undefined) => {
  if (!s) return '';
  const d = toDate(s);
  return `${d.getDate()}/${d.getMonth() + 1} · ${time(s)}`;
};
