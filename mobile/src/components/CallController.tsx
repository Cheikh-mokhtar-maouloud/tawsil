import { router } from 'expo-router';
import { useSocketEvent } from '@/lib/socket';
import { callStore, leaveVoice } from '@/lib/calls';

type Incoming = {
  callId: number;
  orderId: number;
  channel: string;
  appId: string;
  uid: number;
  token: string;
  from: { name: string };
};

const REASON: Record<string, string> = {
  ended: 'انتهت المكالمة',
  missed: 'لم يتم الرد',
  declined: 'رُفضت المكالمة',
  failed: 'تعذر الاتصال',
};

/** يستقبل أحداث المكالمات من الخادم ويفتح شاشة المكالمة */
export default function CallController() {
  useSocketEvent<Incoming>('call:incoming', (d) => {
    if (callStore.get()) return; // مشغول بمكالمة أخرى
    callStore.set({
      callId: d.callId,
      orderId: d.orderId,
      channel: d.channel,
      appId: d.appId,
      uid: d.uid,
      token: d.token,
      incoming: true,
      peerName: d.from.name,
      phase: 'ringing',
      muted: false,
      speaker: false,
    });
    router.push('/call');
  });

  useSocketEvent<{ callId: number }>('call:answered', (d) => {
    if (callStore.get()?.callId === d.callId) callStore.patch({ phase: 'active', answeredAt: Date.now() });
  });

  useSocketEvent<{ callId: number; status: string }>('call:ended', (d) => {
    const c = callStore.get();
    if (c?.callId !== d.callId) return;
    leaveVoice();
    callStore.patch({ phase: 'ended', endedReason: REASON[d.status] ?? 'انتهت المكالمة' });
  });

  return null;
}
