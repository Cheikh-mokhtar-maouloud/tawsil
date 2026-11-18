import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/socket';
import { COURIER_STATUS_LABEL, TYPE_LABEL, money } from '@/lib/format';
import type { Offer, Order, User } from '@/lib/types';
import { colors } from '@/lib/theme';
import { VoicePlayer } from '@/components/Voice';
import { Badge, Btn, Card, ErrorText, Row, Screen, T, s } from '@/components/ui';

type Earnings = { today: { count: number; earned: number }; cashDueToCompany: number };

export default function CourierHome() {
  const { user, setUser, refresh } = useAuth();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [active, setActive] = useState<Order[]>([]);
  const [earn, setEarn] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, o, e] = await Promise.all([
        api<{ orders: Order[] }>('/orders/active'),
        api<{ offer: Offer | null }>('/courier/offer'),
        api<Earnings>('/courier/earnings'),
      ]);
      setActive(a.orders);
      setOffer(o.offer);
      setEarn(e);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
      load();
    }, [load, refresh]),
  );

  useSocketEvent<Offer>('order:offer', setOffer);
  useSocketEvent<{ orderId: number }>('order:offer:expired', (d) => setOffer((o) => (o?.order.id === d.orderId ? null : o)));
  useSocketEvent<Order>('order:update', () => load());
  useSocketEvent<User>('account:update', (u) => setUser(u));

  if (!user) return null;

  if (user.status !== 'active') {
    return (
      <Screen>
        <T bold size={22}>
          مرحباً {user.name}
        </T>
        {user.status === 'suspended' ? (
          <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
            <T>حسابك موقوف حالياً. تواصل مع الإدارة.</T>
          </Card>
        ) : !user.hasDocuments ? (
          <Card>
            <T bold>أكمل تسجيلك</T>
            <T muted size={14}>
              ارفع صورة بطاقة التعريف وصورة مركبتك لتراجعها الإدارة وتفعّل حسابك.
            </T>
            <Btn title="رفع الوثائق" onPress={() => router.push('/documents')} />
          </Card>
        ) : (
          <Card style={{ backgroundColor: colors.goldSoft, borderColor: colors.goldSoft }}>
            <T bold>حسابك قيد المراجعة</T>
            <T size={14} style={{ color: colors.goldInk }}>
              استلمنا وثائقك. ستصلك رسالة عند تفعيل حسابك، ثم يمكنك استقبال الطلبات.
            </T>
          </Card>
        )}
      </Screen>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      await api('/courier/availability', { method: 'PUT', body: { available: !user.available } });
      setUser({ ...user, available: !user.available });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={{ backgroundColor: colors.ink, borderColor: colors.ink }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T size={12} style={{ color: '#A9C6BE' }}>
              أرباح اليوم · {earn?.today.count ?? 0} توصيلة
            </T>
            <T bold size={22} style={{ color: '#fff' }}>
              {money(earn?.today.earned)}
            </T>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: user.available }}
            onPress={toggle}
            disabled={busy}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: user.available ? colors.green : '#3B4A45',
              paddingHorizontal: 16,
              height: 44,
              borderRadius: 22,
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: user.available ? '#7FE0B5' : '#8A9691' }} />
            <T bold size={14} style={{ color: '#fff' }}>
              {user.available ? 'متاح' : 'غير متاح'}
            </T>
          </Pressable>
        </Row>
        {earn && earn.cashDueToCompany > 0 && (
          <T size={12} style={{ color: '#E3B23C' }}>
            مبلغ مستحق للشركة: {money(earn.cashDueToCompany)}
          </T>
        )}
      </Card>

      <ErrorText error={error} />

      {offer && <OfferCard offer={offer} onDone={() => { setOffer(null); load(); }} />}

      {active.map((o) => (
        <Pressable key={o.id} accessibilityRole="button" onPress={() => router.push(`/order/${o.id}`)} style={s.card}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T bold>
              {TYPE_LABEL[o.type]} · #{o.id}
            </T>
            <Badge text={COURIER_STATUS_LABEL[o.status]} />
          </Row>
          <T size={14}>من: {o.pickup.address}</T>
          <T size={14}>إلى: {o.dropoff.address}</T>
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted size={13}>
              اضغط لفتح الطلب
            </T>
            <T bold style={{ color: colors.green }}>
              {money(o.courierFee)}
            </T>
          </Row>
        </Pressable>
      ))}

      {!offer && !active.length && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
          <Ionicons name={user.available ? 'radio-outline' : 'moon-outline'} size={48} color={colors.muted} />
          <T muted style={{ textAlign: 'center' }}>
            {user.available ? 'في انتظار طلب قريب منك… أبقِ التطبيق مفتوحاً.' : 'أنت غير متاح. اضغط «غير متاح» لتبدأ استقبال الطلبات.'}
          </T>
        </View>
      )}
    </Screen>
  );
}

function OfferCard({ offer, onDone }: { offer: Offer; onDone: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((offer.expiresAt - Date.now()) / 1000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const o = offer.order;

  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((offer.expiresAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) onDone();
    }, 500);
    return () => clearInterval(t);
  }, [offer.expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await api(`/orders/${o.id}/${accept ? 'accept' : 'reject'}`, { method: 'POST' });
      onDone();
      if (accept) router.push(`/order/${o.id}`);
    } catch (e) {
      setError((e as Error).message);
      setTimeout(onDone, 1500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderColor: colors.green, borderWidth: 2 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T bold size={18}>
          طلب جديد · {TYPE_LABEL[o.type]}
        </T>
        <T bold style={{ color: colors.danger }}>
          {left} ث
        </T>
      </Row>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.line }}>
        <View style={{ width: `${Math.min(100, (left / 30) * 100)}%`, height: 4, borderRadius: 2, backgroundColor: colors.danger }} />
      </View>
      <View style={{ gap: 4 }}>
        <T muted size={12}>
          الاستلام{offer.distanceToPickupKm != null ? ` · ${offer.distanceToPickupKm} كم منك` : ''}
        </T>
        <T bold size={15}>
          {o.pickup.address}
        </T>
        <T muted size={12}>
          التسليم · {o.distanceKm} كم
        </T>
        <T bold size={15}>
          {o.dropoff.address}
        </T>
      </View>
      {o.locationVoice && <VoicePlayer url={o.locationVoice.url} seconds={o.locationVoice.duration} />}
      <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 }}>
        <T muted>أجرتك</T>
        <T bold size={18}>
          {money(o.courierFee)}
        </T>
      </Row>
      <ErrorText error={error} />
      <Row>
        <Btn title="رفض" variant="outline" onPress={() => respond(false)} disabled={busy} style={{ flex: 1 }} />
        <Btn title="قبول الطلب" onPress={() => respond(true)} loading={busy} style={{ flex: 2 }} />
      </Row>
    </Card>
  );
}
