import { SafeAreaView } from 'react-native-safe-area-context';
import OrderList from '@/components/OrderList';
import { T } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function CourierHistory() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <T bold size={22} style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        توصيلاتي
      </T>
      <OrderList forCourier empty="لم تقم بأي توصيلة بعد." />
    </SafeAreaView>
  );
}
