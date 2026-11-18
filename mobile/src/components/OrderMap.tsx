import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, type MapPressEvent } from 'react-native-maps';
import { colors } from '@/lib/theme';

export type LatLng = { lat: number; lng: number };

export const NOUAKCHOTT: LatLng = { lat: 18.0858, lng: -15.9785 };

/** خريطة الطلب: الاستلام (أخضر)، التسليم (ذهبي)، والموصّل (داكن) */
export default function OrderMap({
  pickup,
  dropoff,
  courier,
  onPress,
  style,
  showsUserLocation,
}: {
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  courier?: LatLng | null;
  onPress?: (p: LatLng) => void;
  style?: StyleProp<ViewStyle>;
  showsUserLocation?: boolean;
}) {
  const ref = useRef<MapView>(null);
  const points = [pickup, dropoff, courier].filter(Boolean) as LatLng[];
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');

  useEffect(() => {
    if (!ref.current || !points.length) return;
    if (points.length === 1) {
      ref.current.animateToRegion({ latitude: points[0].lat, longitude: points[0].lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 400);
    } else {
      ref.current.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 60, bottom: 60, left: 60, right: 60 }, animated: true },
      );
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#E4EBE8' }, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: NOUAKCHOTT.lat, longitude: NOUAKCHOTT.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        showsUserLocation={showsUserLocation}
        onPress={onPress ? (e: MapPressEvent) => onPress({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined}
      >
        {pickup && <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="الاستلام" pinColor={colors.green} />}
        {dropoff && <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} title="التسليم" pinColor={colors.gold} />}
        {courier && (
          <Marker coordinate={{ latitude: courier.lat, longitude: courier.lng }} title="الموصّل" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={st.courier} />
          </Marker>
        )}
        {pickup && dropoff && (
          <Polyline
            coordinates={[
              { latitude: pickup.lat, longitude: pickup.lng },
              { latitude: dropoff.lat, longitude: dropoff.lng },
            ]}
            strokeColor={colors.green}
            strokeWidth={3}
            lineDashPattern={[8, 8]}
          />
        )}
      </MapView>
    </View>
  );
}

const st = StyleSheet.create({
  courier: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, borderWidth: 4, borderColor: '#fff' },
});
