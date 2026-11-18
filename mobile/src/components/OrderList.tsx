import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { COURIER_STATUS_LABEL, STATUS_LABEL, TYPE_LABEL, dateTime, isActive, money } from '@/lib/format';
import type { Order } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Badge, ErrorText, Row, T, s } from './ui';

/** قائمة الطلبات (للزبون أو الموصّل) */
export default function OrderList({ forCourier, empty }: { forCourier?: boolean; empty: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ orders: Order[] }>('/orders');
      setOrders(r.orders);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useSocketEvent<Order>('order:update', (o) => setOrders((list) => list?.map((x) => (x.id === o.id ? o : x)) ?? list));

  return (
    <FlatList
      data={orders ?? []}
      keyExtractor={(o) => String(o.id)}
      contentContainerStyle={{ padding: 20, gap: 12 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListHeaderComponent={<ErrorText error={error} />}
      ListEmptyComponent={orders ? <T muted style={{ textAlign: 'center', marginTop: 40 }}>{empty}</T> : null}
      renderItem={({ item: o }) => (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/order/${o.id}`)} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T bold>
              {TYPE_LABEL[o.type]} · #{o.id}
            </T>
            <Badge
              text={(forCourier ? COURIER_STATUS_LABEL : STATUS_LABEL)[o.status]}
              tone={isActive(o.status) ? 'green' : o.status === 'delivered' ? 'ink' : 'gray'}
            />
          </Row>
          <View style={{ gap: 2 }}>
            <T size={14}>من: {o.pickup.address}</T>
            <T size={14}>إلى: {o.dropoff.address}</T>
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted size={13}>
              {dateTime(o.createdAt)}
            </T>
            <T bold size={14} style={{ color: colors.green }}>
              {money(forCourier ? o.courierFee : o.price)}
            </T>
          </Row>
        </Pressable>
      )}
    />
  );
}
