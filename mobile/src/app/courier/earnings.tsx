import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Card, ErrorText, KV, Loading, Screen, T } from '@/components/ui';

type Period = { count: number; earned: number; collected: number };
type Earnings = { today: Period; week: Period; total: Period; cashDueToCompany: number };

export default function EarningsScreen() {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Earnings>('/courier/earnings')
        .then(setData)
        .catch((e) => setError(e.message));
    }, []),
  );

  return (
    <Screen>
      <T bold size={22}>
        الأرباح
      </T>
      <ErrorText error={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          {[
            ['اليوم', data.today],
            ['آخر 7 أيام', data.week],
            ['المجموع', data.total],
          ].map(([label, p]) => (
            <Card key={label as string}>
              <T bold>{label as string}</T>
              <KV k="عدد التوصيلات" v={String((p as Period).count)} />
              <KV k="أرباحك" v={money((p as Period).earned)} />
              <KV k="قبضت من الزبائن" v={money((p as Period).collected)} />
            </Card>
          ))}
          <Card style={{ backgroundColor: colors.goldSoft, borderColor: colors.goldSoft }}>
            <T bold>حصة الشركة المستحقة عليك</T>
            <T bold size={24}>
              {money(data.cashDueToCompany)}
            </T>
            <T size={13} style={{ color: colors.goldInk }}>
              تقبض المبلغ كاملاً نقداً من الزبون، ثم تسلّم حصة الشركة للإدارة. يُحدَّث هذا الرقم بعد تأكيد الاستلام.
            </T>
          </Card>
        </>
      )}
    </Screen>
  );
}
