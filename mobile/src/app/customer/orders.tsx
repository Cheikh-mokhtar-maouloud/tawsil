import { SafeAreaView } from 'react-native-safe-area-context';
import OrderList from '@/components/OrderList';
import { T } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function CustomerOrders() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <T bold size={22} style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        طلباتي
      </T>
      <OrderList empty="لا توجد طلبات بعد. أنشئ طلبك الأول من «طلب جديد»." />
    </SafeAreaView>
  );
}
