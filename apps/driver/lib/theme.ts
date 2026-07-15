// Acting design tokens — shared visual language for the driver app.
export const c = {
  bg: '#F3F4F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  ink: '#0E1525',
  inkMuted: '#5B6472',
  inkFaint: '#98A0AE',
  border: '#E8EAEF',
  borderStrong: '#D9DCE3',

  brand: '#4F46E5',
  brandDeep: '#3730A3',
  brandSoft: '#EEF0FE',

  online: '#0FA968',
  onlineSoft: '#E4F6EE',
  danger: '#E5484D',
  dangerSoft: '#FCECEC',
  warn: '#D98411',
  warnSoft: '#FBF0DE',
  gold: '#F5A524',
  verified: '#0FA968',
  steel: '#7A828F',

  onInk: '#FFFFFF',
} as const;

// 4pt spacing scale
export const s = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const r = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const type = {
  display: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  small: { fontSize: 12, fontWeight: '500' as const },
};

export const shadow = {
  card: {
    shadowColor: '#0E1525',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  hero: {
    shadowColor: '#0E1525',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
} as const;

export const money = (n: number | null | undefined) =>
  n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');
