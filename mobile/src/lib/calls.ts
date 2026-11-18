/**
 * المكالمات داخل التطبيق عبر Agora.
 * التسجيل لا يتم على الهاتف: الخادم يشغّل التسجيل السحابي عند الرد.
 *
 * مهم: مكتبة Agora مكتبة أصلية (native) لا تعمل داخل Expo Go.
 * لتجربة المكالمات ابنِ نسخة تطوير: npx expo run:android  أو  eas build --profile development
 */
import { useSyncExternalStore } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import type { CallInfo } from './types';

type Phase = 'ringing' | 'connecting' | 'active' | 'ended';
export type CallState = (CallInfo & { phase: Phase; endedReason?: string; muted: boolean; speaker: boolean; answeredAt?: number }) | null;

let state: CallState = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const callStore = {
  get: () => state,
  set: (s: CallState) => {
    state = s;
    emit();
  },
  patch: (p: Partial<NonNullable<CallState>>) => {
    if (state) state = { ...state, ...p };
    emit();
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useCall = () => useSyncExternalStore(callStore.subscribe, callStore.get, callStore.get);

// ---------- Agora ----------
type Engine = any;
let engine: Engine = null;

function loadAgora() {
  try {
    // تحميل متأخر حتى لا يتعطل التطبيق داخل Expo Go
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-agora');
  } catch {
    return null;
  }
}

export const agoraAvailable = () => {
  const mod = loadAgora();
  return Boolean(mod && typeof mod.createAgoraRtcEngine === 'function');
};

async function micPermission() {
  if (Platform.OS !== 'android') return true;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export async function joinVoice(info: Pick<CallInfo, 'appId' | 'token' | 'channel' | 'uid'>, onPeerLeft: () => void) {
  const mod = loadAgora();
  if (!mod) throw new Error('المكالمات تحتاج نسخة تطوير من التطبيق (لا تعمل في Expo Go)');
  if (!(await micPermission())) throw new Error('اسمح للتطبيق باستعمال الميكروفون');
  engine = mod.createAgoraRtcEngine();
  engine.initialize({ appId: info.appId, channelProfile: mod.ChannelProfileType.ChannelProfileCommunication });
  engine.registerEventHandler({
    onUserOffline: () => onPeerLeft(),
  });
  engine.enableAudio();
  engine.setEnableSpeakerphone(false);
  engine.joinChannel(info.token, info.channel, info.uid, {
    clientRoleType: mod.ClientRoleType.ClientRoleBroadcaster,
    publishMicrophoneTrack: true,
    autoSubscribeAudio: true,
  });
}

export function leaveVoice() {
  try {
    engine?.leaveChannel();
    engine?.release();
  } catch {
    // تجاهل
  }
  engine = null;
}

export const setMuted = (m: boolean) => engine?.muteLocalAudioStream(m);
export const setSpeaker = (on: boolean) => engine?.setEnableSpeakerphone(on);
