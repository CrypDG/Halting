// Acting design tokens — dark, high-contrast, premium.
export const c = {
  // surfaces (near-black, layered by elevation)
  bg: '#08090B',
  surface: '#131519',
  surfaceAlt: '#1B1E24',
  surfaceHi: '#242830',
  scrim: 'rgba(0,0,0,0.6)',

  // text
  ink: '#FFFFFF',
  inkMuted: '#98A0AD',
  inkFaint: '#666E7B',
  onInk: '#08090B',

  border: '#22262E',
  borderStrong: '#333945',

  // brand — hi-vis amber, reads brilliantly on black
  brand: '#FFB020',
  brandDeep: '#E0940A',
  brandSoft: 'rgba(255,176,32,0.14)',

  online: '#2DD36F',
  onlineSoft: 'rgba(45,211,111,0.14)',
  danger: '#FF4D4F',
  dangerSoft: 'rgba(255,77,79,0.14)',
  warn: '#FFB020',
  warnSoft: 'rgba(255,176,32,0.14)',
  gold: '#FFC53D',
  verified: '#2DD36F',
  steel: '#8A92A0',
} as const;

// 4pt spacing scale
export const s = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const r = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

// Bold where it counts — display numbers and headlines carry the weight.
export const type = {
  display: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.2 },
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.1 },
  body: { fontSize: 15, fontWeight: '500' as const },
  label: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  small: { fontSize: 12, fontWeight: '600' as const },
};

export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  hero: { shadowColor: '#000', shadowOpacity: 0.7, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16 },
  glow: { shadowColor: c.brand, shadowOpacity: 0.55, shadowRadius: 24, shadowOffset: { width: 0, height: 6 }, elevation: 14 },
} as const;

// Apple-ish motion: soft springs, quick but never snappy-harsh.
export const motion = {
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 120, mass: 1 },
  quick: 180,
  base: 260,
} as const;

export const money = (n: number | null | undefined) =>
  n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');
