import { Alert } from 'react-native';
import { router } from 'expo-router';
import { api, ApiError } from './api';
import { agoraAvailable, callStore, joinVoice, leaveVoice } from './calls';

type StartResponse = { callId: number; channel: string; appId: string; uid: number; token: string; recording: boolean };

const onPeerLeft = () => {
  const c = callStore.get();
  if (c) api(`/calls/${c.callId}/end`, { method: 'POST' }).catch(() => {});
};

/** بدء مكالمة مسجلة مع الطرف الآخر في الطلب. يرجع false إذا لم تكن المكالمات متاحة */
export async function startCall(orderId: number, peerName: string, onFallback?: () => void) {
  if (callStore.get()) return router.push('/call');
  if (!agoraAvailable()) {
    Alert.alert('المكالمات غير متاحة هنا', 'هذه النسخة لا تدعم المكالمات. أرسل رسالة صوتية بدلاً منها.', [
      { text: 'حسناً', onPress: onFallback },
    ]);
    return false;
  }
  try {
    const r = await api<StartResponse>(`/orders/${orderId}/calls`, { method: 'POST' });
    callStore.set({ ...r, orderId, incoming: false, peerName, phase: 'ringing', muted: false, speaker: false });
    router.push('/call');
    await joinVoice(r, onPeerLeft);
    return true;
  } catch (e) {
    const err = e as ApiError;
    leaveVoice();
    if (callStore.get()) callStore.set(null);
    if (err.data?.fallback === 'voice') {
      Alert.alert('تعذر الاتصال', err.message, [{ text: 'إرسال رسالة صوتية', onPress: onFallback }]);
    } else Alert.alert('تعذر الاتصال', err.message);
    return false;
  }
}

export async function answerCall() {
  const c = callStore.get();
  if (!c) return;
  callStore.patch({ phase: 'connecting' });
  try {
    await joinVoice(c, onPeerLeft);
    await api(`/calls/${c.callId}/answer`, { method: 'POST' });
    callStore.patch({ phase: 'active', answeredAt: Date.now() });
  } catch (e) {
    leaveVoice();
    callStore.patch({ phase: 'ended', endedReason: (e as Error).message });
    api(`/calls/${c.callId}/decline`, { method: 'POST' }).catch(() => {});
  }
}

export async function hangUp(decline = false) {
  const c = callStore.get();
  if (!c) return;
  leaveVoice();
  callStore.patch({ phase: 'ended' });
  await api(`/calls/${c.callId}/${decline ? 'decline' : 'end'}`, { method: 'POST' }).catch(() => {});
}
