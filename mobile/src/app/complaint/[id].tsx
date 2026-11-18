import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { Badge, Btn, Card, Chip, ErrorText, Field, Screen, T } from '@/components/ui';
import { View } from 'react-native';

const CUSTOMER_REASONS = ['لم يصل الطرد', 'الطرد تالف', 'تأخر كبير', 'سلوك الموصّل', 'مشكلة في السعر', 'أخرى'];
const COURIER_REASONS = ['الزبون لم يدفع', 'المستلم غير موجود', 'العنوان خاطئ', 'سلوك الزبون', 'أخرى'];

type Complaint = { id: number; reason: string; details: string | null; status: string; decision: string | null; decision_note: string | null; created_at: string };

const STATUS: Record<string, string> = { open: 'جديدة', reviewing: 'قيد المراجعة', resolved: 'مغلقة' };
const DECISION: Record<string, string> = { customer: 'لصالح الزبون', courier: 'لصالح الموصّل', info_requested: 'تطلب الإدارة معلومات إضافية' };

export default function ComplaintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [existing, setExisting] = useState<Complaint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reasons = user?.role === 'courier' ? COURIER_REASONS : CUSTOMER_REASONS;

  useEffect(() => {
    api<{ complaints: Complaint[] }>(`/orders/${id}/complaints`)
      .then((r) => setExisting(r.complaints))
      .catch(() => {});
  }, [id]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/orders/${id}/complaints`, { body: { reason, details } });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = existing.find((c) => c.status !== 'resolved');

  return (
    <Screen edges={[]}>
      {existing.map((c) => (
        <Card key={c.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T bold>{c.reason}</T>
            <Badge text={STATUS[c.status] ?? c.status} tone={c.status === 'resolved' ? 'gray' : 'gold'} />
          </View>
          <T muted size={13}>
            {dateTime(c.created_at)}
          </T>
          {c.decision && (
            <T>
              القرار: {DECISION[c.decision]}
              {c.decision_note ? ` — ${c.decision_note}` : ''}
            </T>
          )}
        </Card>
      ))}

      {!open && (
        <Card>
          <T muted size={14}>
            سيراجع فريق الدعم المحادثة والرسائل الصوتية وتسجيلات المكالمات الخاصة بهذا الطلب، ثم يتواصل معك.
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {reasons.map((r) => (
              <View key={r} style={{ width: '48%' }}>
                <Chip label={r} selected={reason === r} onPress={() => setReason(r)} />
              </View>
            ))}
          </View>
          <Field label="التفاصيل" value={details} onChangeText={setDetails} multiline placeholder="اشرح ما حدث باختصار" />
          <ErrorText error={error} />
          <Btn title="إرسال الشكوى" onPress={submit} loading={busy} disabled={!reason} />
        </Card>
      )}
    </Screen>
  );
}
