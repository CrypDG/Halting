import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, TextInput, View, type PressableProps, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c, motion, r, s, shadow, type as t } from './theme';

const APressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that springs down on touch — the base of every tappable surface. */
export function Touch({ children, style, scaleTo = 0.97, ...props }: PressableProps & { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; scaleTo?: number }) {
  const p = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(1 - p.value * (1 - scaleTo), motion.spring) }],
    opacity: withTiming(1 - p.value * 0.12, { duration: motion.quick }),
  }));
  return (
    <APressable
      onPressIn={() => { p.value = 1; }}
      onPressOut={() => { p.value = 0; }}
      style={[style as any, anim]}
      {...props}
    >
      {children}
    </APressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

type BtnVariant = 'primary' | 'success' | 'danger' | 'ghost';
export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, style }: {
  label: string; onPress?: () => void; variant?: BtnVariant; icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const bg = { primary: c.brand, success: c.online, danger: c.danger, ghost: c.surfaceAlt }[variant];
  const fg = variant === 'ghost' ? c.ink : c.onInk;
  const isDisabled = disabled || loading;
  return (
    <Touch
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.btn, { backgroundColor: bg }, isDisabled && { opacity: 0.4 }, style as any]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles.btnInner}>
          {icon && <Ionicons name={icon} size={19} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Touch>
  );
}

type Tone = 'online' | 'warn' | 'danger' | 'brand' | 'neutral';
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap }) {
  const map = {
    online: [c.onlineSoft, c.online], warn: [c.warnSoft, c.warn], danger: [c.dangerSoft, c.danger],
    brand: [c.brandSoft, c.brand], neutral: [c.surfaceAlt, c.inkMuted],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map[0] }]}>
      {icon && <Ionicons name={icon} size={12} color={map[1]} />}
      <Text style={[styles.badgeText, { color: map[1] }]}>{label}</Text>
    </View>
  );
}

export function StatTile({ icon, value, label, tint = c.brand }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: tint + '22' }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 44, uri }: { name: string; size?: number; uri?: string | null }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surfaceAlt }} />;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || '?'}</Text>
    </View>
  );
}

export function Header({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + s.sm, paddingBottom: s.sm, paddingHorizontal: s.md, backgroundColor: c.bg, flexDirection: 'row', alignItems: 'center', gap: s.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Touch onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color={c.ink} />
      </Touch>
      <Text style={[t.h2, { color: c.ink, flex: 1 }]} numberOfLines={1}>{title}</Text>
      {right}
    </View>
  );
}

export function FormField({ label, hint, ...props }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[t.label, { color: c.inkFaint }]}>{label}</Text>
      <TextInput placeholderTextColor={c.inkFaint} style={styles.formInput} {...props} />
      {hint ? <Text style={{ color: c.inkFaint, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function IconChip({ icon, tint = c.inkMuted }: { icon: keyof typeof Ionicons.glyphMap; tint?: string }) {
  return (
    <View style={[styles.iconChip, { backgroundColor: tint + '22' }]}>
      <Ionicons name={icon} size={18} color={tint} />
    </View>
  );
}

export function Divider() { return <View style={styles.divider} />; }

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.screenHead}>
      <View style={{ flex: 1 }}>
        <Text style={[t.h1, { color: c.ink }]}>{title}</Text>
        {subtitle ? <Text style={{ color: c.inkMuted, marginTop: 3 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function MenuRow({ icon, tint = c.ink, title, subtitle, onPress, right, toggle, danger, last }: {
  icon: keyof typeof Ionicons.glyphMap; tint?: string; title: string; subtitle?: string;
  onPress?: () => void; right?: React.ReactNode;
  toggle?: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean };
  danger?: boolean; last?: boolean;
}) {
  const body = (
    <View style={[styles.rowInner, !last && styles.rowBorder]}>
      <View style={[styles.rowIcon, { backgroundColor: (danger ? c.danger : tint) + '22' }]}>
        <Ionicons name={icon} size={19} color={danger ? c.danger : tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? c.danger : c.ink, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {toggle ? (
        <Switch value={toggle.value} onValueChange={toggle.onValueChange} disabled={toggle.disabled}
          trackColor={{ true: c.online, false: c.borderStrong }} thumbColor={c.ink} />
      ) : (right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.inkFaint} /> : null))}
    </View>
  );
  if (!onPress) return body;
  return <Touch onPress={onPress} scaleTo={0.985}>{body}</Touch>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: r.lg, padding: s.lg, borderWidth: 1, borderColor: c.border },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.md },
  sectionTitle: { ...t.h3, color: c.ink },
  btn: { height: 56, borderRadius: r.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s.lg },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: s.sm },
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: r.pill },
  badgeText: { fontSize: 12, fontWeight: '700' },
  stat: { flex: 1, alignItems: 'flex-start', gap: 6 },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statValue: { ...t.h2, color: c.ink },
  statLabel: { ...t.small, color: c.inkFaint },
  avatar: { backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.onInk, fontWeight: '800' },
  iconChip: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: c.border, marginVertical: s.md },
  screenHead: { flexDirection: 'row', alignItems: 'center', gap: s.md, marginBottom: s.lg },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: s.md, paddingVertical: s.md, paddingHorizontal: s.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  formInput: { borderWidth: 1, borderColor: c.border, borderRadius: r.md, paddingHorizontal: s.md, paddingVertical: 15, fontSize: 16, color: c.ink, backgroundColor: c.surfaceAlt, fontWeight: '600' },
});
