import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { api } from './api';

// expo-notifications يتعطل عند استيراده في Expo Go على أندرويد (منذ SDK 53)، لذلك نحمّله فقط في النسخ المبنية
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const Notifications: typeof import('expo-notifications') | null =
  inExpoGo && Platform.OS === 'android' ? null : require('expo-notifications');

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * تسجيل الهاتف لاستقبال الإشعارات (عرض طلب جديد، مكالمة، رسالة) عندما يكون التطبيق مغلقاً.
 * يعمل في نسخة التطوير أو النسخة النهائية المبنية بـ EAS (لا يعمل في Expo Go على أندرويد).
 */
export async function registerPushToken() {
  if (!Notifications || !Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'الطلبات والرسائل',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return; // يحتاج ربط المشروع بـ EAS (npx eas-cli init)
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/auth/me', { method: 'PUT', body: { pushToken: data } });
}
