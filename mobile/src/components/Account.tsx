import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';
import { Btn, Card, ErrorText, Field, KV, Screen, T } from './ui';

const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE;

export default function Account() {
  const { user, setUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!user) return null;

  const save = async () => {
    try {
      const r = await api<{ user: User }>('/auth/me', { method: 'PUT', body: { name } });
      setUser(r.user);
      setSaved(true);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <T bold size={22}>
        حسابي
      </T>
      <Card>
        <KV k="الهاتف" v={user.phone ?? ''} />
        <KV k="نوع الحساب" v={user.role === 'courier' ? 'موصّل' : 'زبون'} />
        {user.rating != null && <KV k="التقييم" v={`${user.rating} من 5`} />}
      </Card>
      <Card>
        <Field
          label="الاسم"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setSaved(false);
          }}
        />
        <ErrorText error={error} />
        <Btn title={saved ? 'تم الحفظ' : 'حفظ'} variant="soft" onPress={save} disabled={name.trim().length < 2} />
      </Card>
      <Card>
        <T bold>الخصوصية</T>
        <T muted size={14}>
          تُحفظ الرسائل الصوتية والمكالمات الخاصة بكل طلب لمدة محدودة بعد إغلاقه، ولا يستمع إليها إلا فريق الدعم عند وجود شكوى، ثم تُحذف تلقائياً.
        </T>
      </Card>
      {SUPPORT_PHONE ? (
        <Btn title="اتصل بالدعم" variant="outline" onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {})} />
      ) : null}
      <Btn
        title="تسجيل الخروج"
        variant="danger"
        onPress={() =>
          Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'خروج', style: 'destructive', onPress: signOut },
          ])
        }
      />
    </Screen>
  );
}
