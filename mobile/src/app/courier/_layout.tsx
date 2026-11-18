import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket, useSocketEvent } from '@/lib/socket';
import type { Order } from '@/lib/types';
import { colors } from '@/lib/theme';

/**
 * يرسل موقع الموصّل للخادم كل 10 ثوانٍ تقريباً عندما يكون متاحاً أو لديه طلب جارٍ.
 * (يعمل والتطبيق مفتوح. للتتبع في الخلفية يلزم expo-task-manager ونسخة مبنية.)
 */
function LocationTracker() {
  const { user } = useAuth();
  const socket = useSocket();
  const [activeCount, setActiveCount] = useState(0);

  const refresh = () =>
    api<{ orders: Order[] }>('/orders/active')
      .then((r) => setActiveCount(r.orders.length))
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);
  useSocketEvent<Order>('order:update', refresh);

  const tracking = Boolean(user?.status === 'active' && (user.available || activeCount > 0));

  useEffect(() => {
    if (!tracking || !socket) return;
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !alive) return;
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
      if (first) socket.emit('courier:location', { lat: first.coords.latitude, lng: first.coords.longitude });
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 20 },
        (p) => socket.emit('courier:location', { lat: p.coords.latitude, lng: p.coords.longitude }),
      );
      if (!alive) sub.remove();
    })();
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [tracking, socket]);

  return null;
}

export default function CourierTabs() {
  return (
    <>
      <LocationTracker />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.green,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'العمل', tabBarIcon: ({ color, size }) => <Ionicons name="bicycle-outline" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="history"
          options={{ title: 'توصيلاتي', tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="earnings"
          options={{ title: 'الأرباح', tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="account"
          options={{ title: 'حسابي', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }}
        />
      </Tabs>
    </>
  );
}
