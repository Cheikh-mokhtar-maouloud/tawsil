import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { api, audioFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import type { Order, OrderType, Quote } from '@/lib/types';
import { colors } from '@/lib/theme';
import OrderMap, { type LatLng } from '@/components/OrderMap';
import { VoicePlayer, VoiceRecorder } from '@/components/Voice';
import { Btn, Card, Chip, ErrorText, Field, Row, Screen, T } from '@/components/ui';

type Target = 'pickup' | 'dropoff';

/** إنشاء طلب جديد: نقطتان على الخريطة، وصف صوتي للمكان، نوع الشحنة، المستلم، والسعر */
export default function NewOrder() {
  const { user } = useAuth();
  const [target, setTarget] = useState<Target>('pickup');
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [type, setType] = useState<OrderType>('letter');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [voice, setVoice] = useState<{ uri: string; seconds: number } | null>(null);
  const [quoteState, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // نبدأ بموقع الزبون الحالي كنقطة استلام
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (pos) {
        setPickup((p) => p ?? { lat: pos.coords.latitude, lng: pos.coords.longitude });
        setTarget('dropoff');
      }
    })();
  }, []);

  useEffect(() => {
    if (!pickup || !dropoff) return;
    let alive = true;
    api<Quote>('/orders/quote', {
      body: { type, pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng },
    })
      .then((q) => alive && setQuote(q))
      .catch(() => alive && setQuote(null));
    return () => {
      alive = false;
    };
  }, [pickup, dropoff, type]);

  const quote = pickup && dropoff ? quoteState : null;

  const onMapPress = (p: LatLng) => {
    if (target === 'pickup') {
      setPickup(p);
      if (!dropoff) setTarget('dropoff');
    } else setDropoff(p);
  };

  const submit = async () => {
    if (!pickup || !dropoff) return setError('حدد نقطة الاستلام ونقطة التسليم على الخريطة');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ order: Order }>('/orders', {
        form: {
          type,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          pickupAddress,
          dropoffAddress,
          recipientName,
          recipientPhone,
          notes,
          locationVoice: voice ? audioFile(voice.uri) : null,
          locationVoiceDuration: voice?.seconds,
        },
      });
      setDropoff(null);
      setDropoffAddress('');
      setRecipientName('');
      setRecipientPhone('');
      setNotes('');
      setVoice(null);
      router.push(`/order/${r.order.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <T muted size={13}>
          مرحباً {user?.name}
        </T>
        <T bold size={22}>
          إلى أين نوصل اليوم؟
        </T>
      </View>

      <Row>
        <Chip label="① نقطة الاستلام" selected={target === 'pickup'} onPress={() => setTarget('pickup')} />
        <Chip label="② نقطة التسليم" selected={target === 'dropoff'} onPress={() => setTarget('dropoff')} />
      </Row>
      <View>
        <OrderMap pickup={pickup} dropoff={dropoff} onPress={onMapPress} showsUserLocation style={{ height: 230, borderRadius: 16 }} />
        <View style={{ position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
          <T size={12}>اضغط على الخريطة لتحديد {target === 'pickup' ? 'مكان الاستلام' : 'مكان التسليم'}</T>
        </View>
      </View>

      <Card>
        <Field label="من (وصف مختصر)" value={pickupAddress} onChangeText={setPickupAddress} placeholder="مثال: تفرغ زينة، قرب المسجد" />
        <Field label="إلى (وصف مختصر)" value={dropoffAddress} onChangeText={setDropoffAddress} placeholder="مثال: لكصر، بجانب الصيدلية" />
        {voice ? (
          <Row style={{ justifyContent: 'space-between', backgroundColor: colors.greenSoft, borderRadius: 10, padding: 10 }}>
            <VoicePlayer url={voice.uri} seconds={voice.seconds} />
            <Pressable accessibilityRole="button" accessibilityLabel="حذف الوصف الصوتي" onPress={() => setVoice(null)} style={{ padding: 8 }}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </Row>
        ) : (
          <VoiceRecorder mode="toggle" label="سجّل وصفاً صوتياً للمكان" onRecorded={(uri, seconds) => setVoice({ uri, seconds })} />
        )}
      </Card>

      <Card>
        <T muted size={13}>
          نوع الشحنة
        </T>
        <Row>
          <Chip label="رسالة" selected={type === 'letter'} onPress={() => setType('letter')} />
          <Chip label="طرد صغير" selected={type === 'small'} onPress={() => setType('small')} />
          <Chip label="طرد كبير" selected={type === 'large'} onPress={() => setType('large')} />
        </Row>
        <Field label="اسم المستلم" value={recipientName} onChangeText={setRecipientName} />
        <Field
          label="هاتف المستلم (يصله رمز التسليم برسالة)"
          value={recipientPhone}
          onChangeText={setRecipientPhone}
          keyboardType="phone-pad"
          style={{ textAlign: 'left', writingDirection: 'ltr' }}
        />
        <Field label="ملاحظات للموصّل (اختياري)" value={notes} onChangeText={setNotes} multiline />
      </Card>

      <ErrorText error={error} />
      {quote?.tooFar && <ErrorText error={`المسافة أكبر من الحد المسموح (${quote.maxDistanceKm} كم)`} />}

      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <T muted size={12}>
            {quote ? `${quote.distanceKm} كم · الدفع نقداً عند الاستلام` : 'حدد النقطتين لمعرفة السعر'}
          </T>
          <T bold size={22}>
            {quote ? money(quote.price) : '—'}
          </T>
        </View>
        <Btn
          title="اطلب الآن"
          onPress={() =>
            Alert.alert('تأكيد الطلب', `السعر ${money(quote?.price)} يُدفع نقداً للموصّل.`, [
              { text: 'إلغاء', style: 'cancel' },
              { text: 'تأكيد', onPress: submit },
            ])
          }
          loading={busy}
          disabled={!quote || quote.tooFar || !pickupAddress || !dropoffAddress || !recipientName || !recipientPhone}
          style={{ paddingHorizontal: 28 }}
        />
      </Row>
    </Screen>
  );
}
