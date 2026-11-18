import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api, imageFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Btn, Card, Chip, ErrorText, Field, Row, Screen, T } from '@/components/ui';

const VEHICLES = ['دراجة نارية', 'سيارة', 'دراجة هوائية'];

/** رفع وثائق الموصّل لمراجعتها من الإدارة */
export default function Documents() {
  const { setUser } = useAuth();
  const [idDoc, setIdDoc] = useState<string | null>(null);
  const [vehiclePhoto, setVehiclePhoto] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState(VEHICLES[0]);
  const [plate, setPlate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (set: (u: string) => void, camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('اسمح للتطبيق بالوصول للكاميرا أو الصور');
    const r = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) set(r.assets[0].uri);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>('/courier/documents', {
        form: { idDoc: imageFile(idDoc!, 'id.jpg'), vehiclePhoto: imageFile(vehiclePhoto!, 'vehicle.jpg'), vehicle, plate },
      });
      setUser(r.user);
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Slot label="بطاقة التعريف" uri={idDoc} set={setIdDoc} pick={pick} />
      <Slot label="صورة المركبة" uri={vehiclePhoto} set={setVehiclePhoto} pick={pick} />
      <Card>
        <T muted size={13}>
          نوع المركبة
        </T>
        <Row>
          {VEHICLES.map((v) => (
            <Chip key={v} label={v} selected={vehicle === v} onPress={() => setVehicle(v)} />
          ))}
        </Row>
        <Field label="رقم اللوحة (إن وُجد)" value={plate} onChangeText={setPlate} />
      </Card>
      <ErrorText error={error} />
      <Btn title="إرسال للمراجعة" onPress={submit} loading={busy} disabled={!idDoc || !vehiclePhoto} />
      <View style={{ height: 8 }} />
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <T muted style={{ textAlign: 'center' }}>
          لاحقاً
        </T>
      </Pressable>
    </Screen>
  );
}

function Slot({ label, uri, set, pick }: { label: string; uri: string | null; set: (u: string) => void; pick: (set: (u: string) => void, camera: boolean) => void }) {
  return (
    <Card>
      <T bold>{label}</T>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: 170, borderRadius: 10 }} resizeMode="cover" /> : null}
      <Row>
        <Btn title="الكاميرا" variant="soft" onPress={() => pick(set, true)} style={{ flex: 1 }} icon={<Ionicons name="camera-outline" size={18} color={colors.green} />} />
        <Btn title="من الصور" variant="outline" onPress={() => pick(set, false)} style={{ flex: 1 }} />
      </Row>
    </Card>
  );
}
