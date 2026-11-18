import { useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';
import { duration as fmt } from '@/lib/format';
import { mediaUrl } from '@/lib/api';

const MAX_SECONDS = 120;
const MIN_SECONDS = 1;

/**
 * زر الميكروفون: اضغط مطولاً للتسجيل، اترك للإرسال.
 * يمكن أيضاً الضغط مرة للبدء ومرة للإيقاف (mode="toggle") — مفيد لوصف المكان.
 */
export function VoiceRecorder({
  onRecorded,
  mode = 'hold',
  size = 52,
  label,
  disabled,
}: {
  onRecorded: (uri: string, seconds: number) => void;
  mode?: 'hold' | 'toggle';
  size?: number;
  label?: string;
  disabled?: boolean;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const starting = useRef(false);
  const stopRequested = useRef(false);
  const startedAt = useRef(0);
  const recording = state.isRecording;

  const stop = async () => {
    if (starting.current) {
      // ترك الزر قبل أن يبدأ التسجيل فعلاً: نوقفه فور بدايته
      stopRequested.current = true;
      return;
    }
    if (!startedAt.current) return;
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    startedAt.current = 0;
    try {
      if (recorder.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // تجاهل
    }
    if (recorder.uri && seconds >= MIN_SECONDS) onRecorded(recorder.uri, Math.min(seconds, MAX_SECONDS));
  };

  const start = async () => {
    if (starting.current || startedAt.current || disabled) return;
    starting.current = true;
    stopRequested.current = false;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الميكروفون', 'اسمح للتطبيق باستعمال الميكروفون من إعدادات الهاتف لإرسال الرسائل الصوتية');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_SECONDS });
      startedAt.current = Date.now();
    } catch {
      Alert.alert('تعذر التسجيل', 'حاول مرة أخرى');
    } finally {
      starting.current = false;
    }
    if (stopRequested.current) {
      stopRequested.current = false;
      await stop();
    }
  };

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);

  if (mode === 'toggle') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={recording ? 'إيقاف التسجيل' : label ?? 'تسجيل'}
        onPress={recording ? stop : start}
        disabled={disabled}
        style={[st.toggle, recording && { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]}
      >
        <Ionicons name={recording ? 'stop-circle' : 'mic-outline'} size={20} color={recording ? colors.danger : colors.green} />
        <Text style={{ color: recording ? colors.danger : colors.green, fontWeight: '600', fontSize: 15 }}>
          {recording ? `جارٍ التسجيل ${fmt(seconds)} · اضغط للإيقاف` : label ?? 'سجّل رسالة صوتية'}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ alignItems: 'center' }}>
      {recording && (
        <View style={st.recBubble}>
          <View style={st.dot} />
          <Text style={{ color: '#fff', fontWeight: '600' }}>{fmt(seconds)} · اترك للإرسال</Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="اضغط مطولاً لتسجيل رسالة صوتية"
        onPressIn={start}
        onPressOut={stop}
        disabled={disabled}
        style={[
          st.mic,
          { width: size, height: size, borderRadius: size / 2 },
          recording && { backgroundColor: colors.danger, transform: [{ scale: 1.15 }] },
          disabled && { opacity: 0.4 },
        ]}
      >
        <Ionicons name="mic" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

/** مشغل رسالة صوتية مع شريط تقدم */
export function VoicePlayer({
  url,
  seconds,
  dark,
  onPlayed,
}: {
  url: string | null;
  seconds?: number | null;
  dark?: boolean;
  onPlayed?: () => void;
}) {
  const src = mediaUrl(url);
  const player = useAudioPlayer(src ? { uri: src } : null);
  const status = useAudioPlayerStatus(player);
  const played = useRef(false);
  const total = status.duration || seconds || 0;
  const progress = total ? Math.min(1, status.currentTime / total) : 0;

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const toggle = async () => {
    if (!src) return;
    if (status.playing) return player.pause();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    player.play();
    if (!played.current) {
      played.current = true;
      onPlayed?.();
    }
  };

  const fg = dark ? '#fff' : colors.green;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'إيقاف مؤقت' : 'تشغيل الرسالة الصوتية'}
        onPress={toggle}
        style={[st.play, { backgroundColor: dark ? '#fff' : colors.green }]}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={dark ? colors.green : '#fff'} />
      </Pressable>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: dark ? '#4F8D7E' : colors.line }}>
        <View style={{ width: `${progress * 100}%`, height: 4, borderRadius: 2, backgroundColor: fg }} />
      </View>
      <Text style={{ color: dark ? '#fff' : colors.muted, fontSize: 12 }}>
        {fmt(status.playing || status.currentTime ? status.currentTime : total)}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  mic: { backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recBubble: {
    position: 'absolute',
    bottom: 64,
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    width: 190,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  toggle: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
});
