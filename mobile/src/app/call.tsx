import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { callStore, setMuted, setSpeaker, useCall } from '@/lib/calls';
import { answerCall, hangUp } from '@/lib/callActions';
import { duration } from '@/lib/format';
import { colors } from '@/lib/theme';

/** شاشة المكالمة: واردة أو صادرة، مع تنبيه واضح بأنها مسجلة */
export default function CallScreen() {
  const call = useCall();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // بعد انتهاء المكالمة نغلق الشاشة تلقائياً
  useEffect(() => {
    if (!call) {
      if (router.canGoBack()) router.back();
      return;
    }
    if (call.phase === 'ended') {
      const t = setTimeout(() => {
        callStore.set(null);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [call]);

  if (!call) return <View style={{ flex: 1, backgroundColor: colors.callBg }} />;

  const status =
    call.phase === 'ended'
      ? call.endedReason ?? 'انتهت المكالمة'
      : call.phase === 'active'
        ? duration(call.answeredAt ? (now - call.answeredAt) / 1000 : 0)
        : call.phase === 'connecting'
          ? 'جارٍ الاتصال…'
          : call.incoming
            ? 'مكالمة واردة…'
            : 'يرنّ…';

  const ringingIncoming = call.incoming && call.phase === 'ringing';

  return (
    <SafeAreaView style={st.root}>
      <View style={st.badge}>
        <View style={st.recDot} />
        <Text style={{ color: '#FFD9D0', fontSize: 14 }}>هذه المكالمة مسجلة</Text>
      </View>

      <View style={{ alignItems: 'center', marginTop: 64, gap: 8 }}>
        <View style={st.avatar}>
          <Text style={{ color: colors.gold, fontSize: 40, fontWeight: '700' }}>{call.peerName.slice(0, 1)}</Text>
        </View>
        <Text style={st.name}>{call.peerName}</Text>
        <Text style={st.sub}>طلب #{call.orderId} · مكالمة عبر التطبيق</Text>
        <Text style={[st.sub, { fontSize: 20, color: '#fff', marginTop: 8 }]}>{status}</Text>
      </View>

      <View style={st.notice}>
        <Text style={st.noticeText}>
          رقم هاتفك مخفي عن الطرف الآخر. يُحفظ التسجيل مع الطلب ولا تسمعه إلا الإدارة عند وجود شكوى.
        </Text>
      </View>

      <View style={st.actions}>
        {ringingIncoming ? (
          <>
            <Action icon="call" label="رد" color="#1F9D6B" onPress={answerCall} big />
            <Action icon="close" label="رفض" color="#C2402B" onPress={() => hangUp(true)} big />
          </>
        ) : call.phase === 'ended' ? (
          <Action icon="checkmark" label="إغلاق" color={colors.callCard} onPress={() => callStore.set(null)} big />
        ) : (
          <>
            <Action
              icon={call.muted ? 'mic-off' : 'mic'}
              label={call.muted ? 'إلغاء الكتم' : 'كتم'}
              color={call.muted ? '#fff' : colors.callCard}
              iconColor={call.muted ? colors.callBg : '#fff'}
              onPress={() => {
                setMuted(!call.muted);
                callStore.patch({ muted: !call.muted });
              }}
            />
            <Action icon="call" label="إنهاء" color="#C2402B" onPress={() => hangUp()} big rotate />
            <Action
              icon="volume-high"
              label="مكبر الصوت"
              color={call.speaker ? '#fff' : colors.callCard}
              iconColor={call.speaker ? colors.callBg : '#fff'}
              onPress={() => {
                setSpeaker(!call.speaker);
                callStore.patch({ speaker: !call.speaker });
              }}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Action({
  icon,
  label,
  color,
  iconColor = '#fff',
  onPress,
  big,
  rotate,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  iconColor?: string;
  onPress: () => void;
  big?: boolean;
  rotate?: boolean;
}) {
  const size = big ? 72 : 64;
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name={icon} size={28} color={iconColor} style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined} />
      </Pressable>
      <Text style={{ color: '#A9C6BE', fontSize: 13 }}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.callBg, alignItems: 'center', paddingHorizontal: 24 },
  badge: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3A1F1A',
    borderWidth: 1,
    borderColor: '#C2543F',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B52' },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.callCard,
    borderWidth: 2,
    borderColor: '#2D7564',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 12 },
  sub: { color: '#A9C6BE', fontSize: 14 },
  notice: { marginTop: 32, backgroundColor: colors.callCard, borderRadius: 14, padding: 14 },
  noticeText: { color: '#CFE3DC', fontSize: 13, textAlign: 'center', lineHeight: 21 },
  actions: { marginTop: 'auto', marginBottom: 40, flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
});
