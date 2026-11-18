import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, radius } from '@/lib/theme';

export function T({ style, muted, bold, size, ...p }: TextProps & { muted?: boolean; bold?: boolean; size?: number }) {
  return (
    <Text
      {...p}
      style={[
        { color: muted ? colors.muted : colors.ink, fontSize: size ?? 15, fontWeight: bold ? '700' : '400', writingDirection: 'rtl' },
        style,
      ]}
    />
  );
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  style,
  bg = colors.bg,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  bg?: string;
}) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={[{ padding: 20, gap: 14, paddingBottom: 40 }, style]} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, style]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.card, style]}>{children}</View>
);

export const Row = ({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
);

type BtnVariant = 'primary' | 'outline' | 'danger' | 'soft' | 'dark';
export function Btn({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  icon,
  accessibilityLabel,
}: {
  title?: string;
  onPress?: () => void;
  variant?: BtnVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
  accessibilityLabel?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon}
          {title ? <Text style={{ color: v.fg, fontSize: 16, fontWeight: '600' }}>{title}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.green, fg: '#fff', border: colors.green },
  outline: { bg: '#fff', fg: colors.ink, border: colors.line },
  danger: { bg: '#fff', fg: colors.danger, border: colors.line },
  soft: { bg: colors.greenSoft, fg: colors.green, border: colors.greenSoft },
  dark: { bg: colors.ink, fg: '#fff', border: colors.ink },
};

export function Field({ label, error, ...p }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <T muted size={13}>
        {label}
      </T>
      <TextInput
        placeholderTextColor="#8A9691"
        {...p}
        accessibilityLabel={label}
        style={[s.input, p.multiline && { height: 90, paddingTop: 10, textAlignVertical: 'top' }, p.style]}
      />
      {error ? <T style={{ color: colors.danger }} size={13}>{error}</T> : null}
    </View>
  );
}

export const ErrorText = ({ error }: { error?: string | null }) =>
  error ? (
    <View style={s.error}>
      <T style={{ color: colors.danger }} size={14}>
        {error}
      </T>
    </View>
  ) : null;

export function Badge({ text, tone = 'green' }: { text: string; tone?: 'green' | 'gold' | 'red' | 'gray' | 'ink' }) {
  const t = {
    green: [colors.greenSoft, colors.green],
    gold: [colors.goldSoft, colors.goldInk],
    red: [colors.dangerSoft, colors.danger],
    gray: [colors.lineSoft, colors.muted],
    ink: [colors.ink, '#fff'],
  }[tone];
  return (
    <View style={{ backgroundColor: t[0], paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start' }}>
      <Text style={{ color: t[1], fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && { borderColor: colors.green, borderWidth: 2, backgroundColor: colors.greenSoft }]}
    >
      <Text style={{ color: selected ? colors.green : colors.ink, fontWeight: selected ? '700' : '400', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export const Loading = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
    <ActivityIndicator color={colors.green} size="large" />
  </View>
);

export const KV = ({ k, v }: { k: string; v: ReactNode }) => (
  <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
    <T muted size={14}>
      {k}
    </T>
    {typeof v === 'string' || typeof v === 'number' ? <T size={14}>{v}</T> : v}
  </Row>
);

export const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 },
  btn: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: '#F9FBFA',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  error: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12 },
  chip: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
