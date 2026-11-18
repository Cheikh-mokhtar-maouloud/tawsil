import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Role, User } from '@/lib/types';
import { Btn, Card, Chip, ErrorText, Field, Row, Screen, T } from '@/components/ui';
import { colors } from '@/lib/theme';

type Step = 'phone' | 'code';

export default function Login() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('customer');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ isNewUser: boolean; devCode?: string }>('/auth/request-otp', { body: { phone } });
      setIsNew(r.isNewUser);
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>('/auth/verify-otp', {
        body: { phone, code, ...(isNew ? { name, role } : {}) },
      });
      await signIn(r.token, r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ paddingTop: 48 }}>
      <View style={{ gap: 6, marginBottom: 12 }}>
        <T bold size={30} style={{ color: colors.green }}>
          توصيل
        </T>
        <T muted>توصيل الرسائل والطرود بسرعة وأمان، مع محادثة محفوظة لحمايتك.</T>
      </View>

      {step === 'phone' ? (
        <Card>
          <Field
            label="رقم الهاتف"
            placeholder="مثال: 22 33 44 55"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            autoFocus
            style={{ textAlign: 'left', writingDirection: 'ltr' }}
          />
          <T muted size={13}>
            سنرسل لك رمز دخول برسالة نصية.
          </T>
          <ErrorText error={error} />
          <Btn title="متابعة" onPress={requestCode} loading={busy} disabled={phone.replace(/\D/g, '').length < 8} />
        </Card>
      ) : (
        <Card>
          <T>أدخل الرمز المرسل إلى {phone}</T>
          {devCode && (
            <View style={{ backgroundColor: colors.goldSoft, borderRadius: 10, padding: 10 }}>
              <T size={13} style={{ color: colors.goldInk }}>
                وضع التجربة: الرمز هو {devCode}
              </T>
            </View>
          )}
          <Field
            label="رمز الدخول"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            style={{ textAlign: 'center', letterSpacing: 8, fontSize: 22 }}
          />
          {isNew && (
            <>
              <Field label="اسمك" value={name} onChangeText={setName} placeholder="الاسم الكامل" />
              <T muted size={13}>
                نوع الحساب
              </T>
              <Row>
                <Chip label="أريد إرسال شحنات" selected={role === 'customer'} onPress={() => setRole('customer')} />
                <Chip label="أريد العمل موصّلاً" selected={role === 'courier'} onPress={() => setRole('courier')} />
              </Row>
              {role === 'courier' && (
                <T muted size={13}>
                  بعد التسجيل ارفع بطاقة التعريف وصورة المركبة، وتفعّل الإدارة حسابك بعد المراجعة.
                </T>
              )}
              <T muted size={12}>
                بالمتابعة توافق على شروط الاستخدام، ومنها حفظ المحادثات والمكالمات الخاصة بكل طلب لمدة محدودة للرجوع إليها عند أي نزاع.
              </T>
            </>
          )}
          <ErrorText error={error} />
          <Btn title="دخول" onPress={verify} loading={busy} disabled={code.length < 6 || (isNew && name.trim().length < 2)} />
          <Btn
            title="تغيير الرقم"
            variant="outline"
            onPress={() => {
              setStep('phone');
              setCode('');
              setError(null);
            }}
          />
        </Card>
      )}
    </Screen>
  );
}
