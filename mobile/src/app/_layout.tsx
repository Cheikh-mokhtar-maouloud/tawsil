import { useEffect } from 'react';
import { DevSettings, I18nManager, StyleSheet, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SocketProvider } from '@/lib/socket';
import { Notifications } from '@/lib/push';
import CallController from '@/components/CallController';
import { Loading } from '@/components/ui';
import { colors } from '@/lib/theme';

// الواجهة بالعربية من اليمين لليسار
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  Updates.reloadAsync().catch(() => DevSettings.reload());
}

function Gate() {
  const { ready, user } = useAuth();
  const segments = useSegments();

  // إعادة التوجيه حسب حالة الدخول ونوع الحساب
  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    if (!user) {
      if (first !== 'login') router.replace('/login');
      return;
    }
    const home = user.role === 'courier' ? '/courier' : '/customer';
    if (!first || first === 'login') router.replace(home);
    else if (first === 'customer' && user.role === 'courier') router.replace('/courier');
    else if (first === 'courier' && user.role === 'customer') router.replace('/customer');
  }, [ready, user, segments]);

  // فتح الشاشة المناسبة عند الضغط على إشعار
  useEffect(() => {
    if (!Notifications) return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { type?: string; orderId?: number };
      if (!d?.orderId) return;
      if (d.type === 'chat') router.push(`/chat/${d.orderId}`);
      else if (d.type !== 'offer' && d.type !== 'call') router.push(`/order/${d.orderId}`);
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { fontWeight: '700' },
          headerTintColor: colors.ink,
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="customer" />
        <Stack.Screen name="courier" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="call" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="complaint/[id]" options={{ headerShown: true, title: 'الإبلاغ عن مشكلة' }} />
        <Stack.Screen name="documents" options={{ headerShown: true, title: 'وثائق الموصّل' }} />
      </Stack>
      {user && <CallController />}
      {!ready && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
          <Loading />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <SocketProvider>
          <Gate />
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
