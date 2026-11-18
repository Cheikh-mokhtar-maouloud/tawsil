import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, audioFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrderRoom, useSocketEvent } from '@/lib/socket';
import { startCall } from '@/lib/callActions';
import { duration, time } from '@/lib/format';
import type { Message, Order } from '@/lib/types';
import { colors } from '@/lib/theme';
import { VoicePlayer, VoiceRecorder } from '@/components/Voice';
import { ErrorText, Row, T } from '@/components/ui';

const QUICK = ['وصلت', 'أنا في الطريق', 'اتصل بي', 'أين أنت بالضبط؟'];

/** محادثة الطلب: رسائل نصية وصوتية محفوظة، وسجل المكالمات */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([
        api<{ order: Order }>(`/orders/${orderId}`),
        api<{ messages: Message[]; canWrite: boolean }>(`/orders/${orderId}/messages`),
      ]);
      setOrder(o.order);
      setMessages(m.messages);
      setCanWrite(m.canWrite);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- جلب البيانات عند فتح الشاشة
    load();
  }, [load]);
  useOrderRoom(orderId);

  const add = (m: Message) => setMessages((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
  useSocketEvent<Message>('message:new', (m) => m.orderId === orderId && add(m));
  useSocketEvent<{ id: number }>('message:listened', (d) =>
    setMessages((all) => all.map((m) => (m.id === d.id ? { ...m, listenedAt: new Date().toISOString() } : m))),
  );
  useSocketEvent<Order>('order:update', (o) => {
    if (o.id !== orderId) return;
    setOrder(o);
    setCanWrite(Boolean(o.courier) && (o.status === 'accepted' || o.status === 'picked_up'));
  });

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const sendText = async (body: string) => {
    if (!body.trim()) return;
    setSending(true);
    try {
      const r = await api<{ message: Message }>(`/orders/${orderId}/messages`, { body: { body } });
      add(r.message);
      setText('');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendVoice = async (uri: string, seconds: number) => {
    setSending(true);
    try {
      const r = await api<{ message: Message }>(`/orders/${orderId}/messages/voice`, {
        form: { audio: audioFile(uri), duration: seconds },
      });
      add(r.message);
      setError(null);
    } catch (e) {
      setError(`لم تُرسل الرسالة الصوتية: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const peer = user?.role === 'courier' ? order?.customer : order?.courier;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderColor: colors.line, padding: 10, gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={{ padding: 10 }}>
          <Ionicons name="arrow-forward" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <T bold>{peer?.name ?? '…'}</T>
          <T muted size={12}>
            طلب #{orderId}
          </T>
        </View>
        {canWrite && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="اتصال مسجل"
            onPress={() => startCall(orderId, peer?.name ?? '')}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="call" size={20} color="#fff" />
          </Pressable>
        )}
      </Row>

      <Row style={{ backgroundColor: colors.goldSoft, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.goldInk} />
        <T size={12} style={{ color: colors.goldInk }}>
          هذه المحادثة محفوظة لحمايتك عند أي نزاع
        </T>
      </Row>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          renderItem={({ item }) => <Bubble m={item} mine={item.senderId === user?.id} />}
          ListEmptyComponent={<T muted style={{ textAlign: 'center', marginTop: 30 }}>لا توجد رسائل بعد</T>}
        />
        <ErrorText error={error} />

        {canWrite ? (
          <>
            <Row style={{ paddingHorizontal: 12, paddingBottom: 6, flexWrap: 'wrap' }} gap={6}>
              {QUICK.map((q) => (
                <Pressable
                  key={q}
                  accessibilityRole="button"
                  onPress={() => sendText(q)}
                  style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 }}
                >
                  <T size={13}>{q}</T>
                </Pressable>
              ))}
            </Row>
            <Row style={{ backgroundColor: '#fff', borderTopWidth: 1, borderColor: colors.line, padding: 10 }} gap={10}>
              <TextInput
                accessibilityLabel="اكتب رسالة"
                placeholder="اكتب رسالة…"
                placeholderTextColor="#8A9691"
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => sendText(text)}
                returnKeyType="send"
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 23,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.bg,
                  paddingHorizontal: 16,
                  fontSize: 15,
                  textAlign: 'right',
                  color: colors.ink,
                }}
              />
              {text.trim() ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="إرسال"
                  disabled={sending}
                  onPress={() => sendText(text)}
                  style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="send" size={20} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
                </Pressable>
              ) : (
                <VoiceRecorder onRecorded={sendVoice} disabled={sending} />
              )}
            </Row>
          </>
        ) : (
          <View style={{ padding: 14, backgroundColor: '#fff', borderTopWidth: 1, borderColor: colors.line }}>
            <T muted size={13} style={{ textAlign: 'center' }}>
              المحادثة مغلقة لهذا الطلب. للمشاكل استعمل «الإبلاغ عن مشكلة».
            </T>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  if (m.kind === 'system' || m.kind === 'call') {
    const label =
      m.kind === 'call' ? `${m.body}${m.call?.status === 'ended' ? ` · ${duration(m.call?.duration)}` : ''} · ${time(m.createdAt)}` : m.body;
    return (
      <View style={{ alignSelf: 'center', backgroundColor: m.kind === 'call' ? '#fff' : '#E4EBE8', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, borderWidth: m.kind === 'call' ? 1 : 0, borderColor: colors.line, maxWidth: '90%' }}>
        <T muted size={12} style={{ textAlign: 'center' }}>
          {label}
        </T>
      </View>
    );
  }

  const markListened = () => {
    if (!mine && !m.listenedAt) api(`/messages/${m.id}/listened`, { method: 'POST' }).catch(() => {});
  };

  return (
    <View
      style={{
        alignSelf: mine ? 'flex-start' : 'flex-end',
        maxWidth: '82%',
        backgroundColor: mine ? colors.green : '#fff',
        borderWidth: mine ? 0 : 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 9,
        gap: 4,
      }}
    >
      {m.kind === 'voice' ? (
        m.audioUrl ? (
          <VoicePlayer url={m.audioUrl} seconds={m.duration} dark={mine} onPlayed={markListened} />
        ) : (
          <T size={13} style={{ color: mine ? '#CFE3DC' : colors.muted }}>
            {m.purged ? 'حُذفت الرسالة بعد انتهاء مدة الحفظ' : 'رسالة صوتية'}
          </T>
        )
      ) : (
        <T style={{ color: mine ? '#fff' : colors.ink }}>{m.body}</T>
      )}
      <T size={11} style={{ color: mine ? '#CFE3DC' : colors.muted, alignSelf: 'flex-end' }}>
        {m.body && m.kind === 'voice' ? `${m.body} · ` : ''}
        {time(m.createdAt)}
        {mine ? (m.listenedAt ? ' · سُمعت' : ' ✓') : ''}
      </T>
    </View>
  );
}
