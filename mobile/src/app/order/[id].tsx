import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, imageFile, mediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrderRoom, useSocketEvent } from '@/lib/socket';
import { startCall } from '@/lib/callActions';
import { COURIER_STATUS_LABEL, STATUS_LABEL, TYPE_LABEL, money } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { colors } from '@/lib/theme';
import OrderMap, { type LatLng } from '@/components/OrderMap';
import { VoicePlayer } from '@/components/Voice';
import { Badge, Btn, Card, ErrorText, Field, KV, Loading, Row, T } from '@/components/ui';

const STEPS: OrderStatus[] = ['searching', 'accepted', 'picked_up', 'delivered'];
const STEP_LABEL = ['تم الطلب', 'تم القبول', 'تم الاستلام', 'تم التسليم'];

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [courierPos, setCourierPos] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const isCourier = user?.role === 'courier';

  const load = useCallback(async () => {
    try {
      const r = await api<{ order: Order }>(`/orders/${orderId}`);
      setOrder(r.order);
      if (r.order.courier?.lat != null && r.order.courier.lng != null) setCourierPos({ lat: r.order.courier.lat, lng: r.order.courier.lng });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- جلب البيانات عند فتح الشاشة
    load();
  }, [load]);
  useOrderRoom(orderId);
  useSocketEvent<Order>('order:update', (o) => {
    if (o.id === orderId) setOrder(o);
  });
  useSocketEvent<{ orderId: number; lat: number; lng: number }>('courier:location', (p) => {
    if (p.orderId === orderId) setCourierPos({ lat: p.lat, lng: p.lng });
  });

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: 20 }}>
        {error ? <ErrorText error={error} /> : <Loading />}
      </SafeAreaView>
    );
  }

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const post = (path: string, body?: unknown) =>
    act(async () => {
      const r = await api<{ order: Order }>(`/orders/${order.id}/${path}`, { method: 'POST', body: body ?? {} });
      setOrder(r.order);
    });

  const pickup = () =>
    act(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) throw new Error('اسمح للتطبيق باستعمال الكاميرا لتصوير الشحنة');
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (shot.canceled) return;
      const r = await api<{ order: Order }>(`/orders/${order.id}/pickup`, { form: { photo: imageFile(shot.assets[0].uri) } });
      setOrder(r.order);
    });

  const cancel = () =>
    Alert.alert(
      isCourier ? 'التخلي عن الطلب' : 'إلغاء الطلب',
      isCourier ? 'سيُعرض الطلب على موصّل آخر. هل أنت متأكد؟' : 'هل تريد إلغاء هذا الطلب؟',
      [
        { text: 'رجوع', style: 'cancel' },
        { text: 'نعم', style: 'destructive', onPress: () => post('cancel') },
      ],
    );

  const peer = isCourier ? order.customer : order.courier;
  const live = order.status === 'accepted' || order.status === 'picked_up';
  const stepIndex = STEPS.indexOf(order.status);
  const callPeer = () => startCall(order.id, peer?.name ?? '', () => router.push(`/chat/${order.id}`));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View>
        <OrderMap pickup={order.pickup} dropoff={order.dropoff} courier={live ? courierPos : null} style={{ height: 260 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(isCourier ? '/courier' : '/customer'))}
          style={{ position: 'absolute', top: 12, right: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="arrow-forward" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T bold size={20} style={{ flex: 1 }}>
            {(isCourier ? COURIER_STATUS_LABEL : STATUS_LABEL)[order.status]}
          </T>
          <T muted size={13}>
            طلب #{order.id}
          </T>
        </Row>

        {stepIndex >= 0 && (
          <View style={{ gap: 6 }}>
            <Row gap={6}>
              {STEPS.map((s, i) => (
                <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= stepIndex ? colors.green : colors.line }} />
              ))}
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              {STEP_LABEL.map((l, i) => (
                <T key={l} size={11} muted={i !== stepIndex} bold={i === stepIndex} style={i === stepIndex ? { color: colors.green } : undefined}>
                  {l}
                </T>
              ))}
            </Row>
          </View>
        )}

        {order.status === 'searching' && !isCourier && (
          <Card style={{ backgroundColor: colors.goldSoft, borderColor: colors.goldSoft }}>
            <T>نعرض طلبك على أقرب موصّل متاح… ستصلك رسالة عند القبول.</T>
          </Card>
        )}

        {peer && (
          <Card>
            <Row>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                <T bold style={{ color: colors.green }}>
                  {peer.name.slice(0, 1)}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T bold>{peer.name}</T>
                <T muted size={13}>
                  {isCourier ? 'الزبون' : [peer.vehicle, peer.plate, peer.rating ? `★ ${peer.rating}` : null].filter(Boolean).join(' · ')}
                </T>
              </View>
              {live && (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="المحادثة"
                    onPress={() => router.push(`/chat/${order.id}`)}
                    style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.green} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="اتصال مسجل"
                    onPress={callPeer}
                    style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="call" size={20} color="#fff" />
                  </Pressable>
                </>
              )}
            </Row>
            {!live && order.status === 'delivered' && (
              <Btn title="عرض المحادثة" variant="outline" onPress={() => router.push(`/chat/${order.id}`)} />
            )}
          </Card>
        )}

        {/* رمز التسليم يظهر للزبون فقط */}
        {!isCourier && order.deliveryCode && live && (
          <Card style={{ backgroundColor: colors.goldSoft, borderColor: colors.goldSoft }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T bold size={14}>
                  رمز التسليم
                </T>
                <T size={12} style={{ color: colors.goldInk }}>
                  أُرسل للمستلم برسالة، ويعطيه للموصّل عند الوصول فقط
                </T>
              </View>
              <T bold size={26} style={{ letterSpacing: 6, writingDirection: 'ltr' }}>
                {order.deliveryCode}
              </T>
            </Row>
          </Card>
        )}

        {/* خطوات الموصّل */}
        {isCourier && order.status === 'accepted' && (
          <Card>
            <T bold>عند استلام الشحنة</T>
            <T muted size={14}>
              صوّر الشحنة قبل المغادرة. الصورة تحميك عند أي نزاع.
            </T>
            <Btn
              title="تصوير الشحنة وتأكيد الاستلام"
              onPress={pickup}
              loading={busy}
              icon={<Ionicons name="camera-outline" size={20} color="#fff" />}
            />
            <Btn title="فتح الطريق إلى الاستلام" variant="outline" onPress={() => openNav(order.pickup)} />
          </Card>
        )}
        {isCourier && order.status === 'picked_up' && (
          <Card>
            <T bold>عند الوصول للمستلم</T>
            <T muted size={14}>
              اطلب من المستلم رمز التسليم المكوّن من 4 أرقام.
            </T>
            <Field
              label="رمز التسليم"
              keyboardType="number-pad"
              maxLength={4}
              value={code}
              onChangeText={setCode}
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8 }}
            />
            <Btn title="تأكيد التسليم" onPress={() => post('deliver', { code })} loading={busy} disabled={code.length !== 4} />
            <Btn title="فتح الطريق إلى التسليم" variant="outline" onPress={() => openNav(order.dropoff)} />
            {order.recipient.phone && (
              <Btn
                title={`اتصال بالمستلم ${order.recipient.name}`}
                variant="outline"
                onPress={() => Linking.openURL(`tel:${order.recipient.phone}`)}
              />
            )}
          </Card>
        )}

        <Card>
          <KV k="النوع" v={TYPE_LABEL[order.type]} />
          <KV k="من" v={order.pickup.address} />
          <KV k="إلى" v={order.dropoff.address} />
          <KV k="المستلم" v={order.recipient.name} />
          <KV k="المسافة" v={`${order.distanceKm} كم`} />
          <KV k={isCourier ? 'أجرتك' : 'السعر'} v={money(isCourier ? order.courierFee : order.price)} />
          {isCourier && <KV k="تقبض من الزبون نقداً" v={money(order.price)} />}
          {order.notes ? <KV k="ملاحظات" v={order.notes} /> : null}
          {order.locationVoice && (
            <View style={{ gap: 6, paddingTop: 4 }}>
              <T muted size={13}>
                وصف الزبون الصوتي للمكان
              </T>
              <VoicePlayer url={order.locationVoice.url} seconds={order.locationVoice.duration} />
            </View>
          )}
          {order.pickupPhoto && (
            <View style={{ gap: 6, paddingTop: 4 }}>
              <T muted size={13}>
                صورة الشحنة عند الاستلام
              </T>
              <Image source={{ uri: mediaUrl(order.pickupPhoto)! }} style={{ width: '100%', height: 180, borderRadius: 10 }} resizeMode="cover" />
            </View>
          )}
          {order.cancelReason ? <KV k="سبب الإلغاء" v={order.cancelReason} /> : null}
        </Card>

        {!isCourier && order.status === 'delivered' && <Rate order={order} onDone={setOrder} />}

        <ErrorText error={error} />

        {((!isCourier && ['searching', 'accepted'].includes(order.status)) || (isCourier && order.status === 'accepted')) && (
          <Btn title={isCourier ? 'التخلي عن الطلب' : 'إلغاء الطلب'} variant="danger" onPress={cancel} />
        )}
        {order.status !== 'searching' && order.status !== 'cancelled' && (
          <Btn title="الإبلاغ عن مشكلة" variant="danger" onPress={() => router.push(`/complaint/${order.id}`)} />
        )}
        {order.status === 'no_courier' && !isCourier && (
          <Badge text="لم يتوفر موصّل في الوقت الحالي، جرّب الطلب مرة أخرى بعد قليل" tone="red" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function openNav(p: { lat: number; lng: number }) {
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`).catch(() => {});
}

function Rate({ order, onDone }: { order: Order; onDone: (o: Order) => void }) {
  const [stars, setStars] = useState(order.rating ?? 0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const done = Boolean(order.rating);

  return (
    <Card>
      <T bold>{done ? 'شكراً على تقييمك' : 'قيّم الموصّل'}</T>
      <Row style={{ justifyContent: 'center' }} gap={4}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} نجوم`} disabled={done} onPress={() => setStars(n)} style={{ padding: 6 }}>
            <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={32} color={colors.gold} />
          </Pressable>
        ))}
      </Row>
      {!done && (
        <>
          <Field label="تعليق (اختياري)" value={comment} onChangeText={setComment} />
          <ErrorText error={error} />
          <Btn
            title="إرسال التقييم"
            disabled={!stars}
            onPress={async () => {
              try {
                const r = await api<{ order: Order }>(`/orders/${order.id}/rate`, { body: { rating: stars, comment } });
                onDone(r.order);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </>
      )}
    </Card>
  );
}
