import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#0f172a',
  green: '#059669',
  red: '#dc2626',
  amber: '#d97706',
  border: '#e2e8f0',
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  h1: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnGreen: { backgroundColor: colors.green },
  btnRed: { backgroundColor: colors.red },
  error: { color: colors.red, marginBottom: 12 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    overflow: 'hidden',
  },
});
