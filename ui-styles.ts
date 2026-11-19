import { StyleSheet } from 'react-native';
import { dark, light, radius, space, useColors } from './theme';
import type { Palette } from './theme';

function makeUi(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { flexGrow: 1, padding: space.xl },
    eyebrow: { color: c.accent, fontWeight: '700', letterSpacing: 2, fontSize: 12 },
    title: { color: c.text, fontSize: 24, fontWeight: '700', marginTop: 20 },
    text: { color: c.textMuted, fontSize: 16, lineHeight: 24, marginTop: space.md },
    small: { color: c.textMuted, fontSize: 14, marginTop: space.sm },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.lg, marginTop: space.md },
    cardTitle: { color: c.text, fontWeight: '700', fontSize: 16 },
    selected: { borderColor: c.accent, backgroundColor: c.accentSoft },
    primary: { backgroundColor: c.primary, borderRadius: radius.md, padding: space.lg, marginTop: 20, minHeight: 52, justifyContent: 'center' },
    primaryText: { color: c.primaryText, textAlign: 'center', fontWeight: '700', fontSize: 16 },
    secondary: { borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.lg, marginTop: space.md, minHeight: 52, justifyContent: 'center' },
    buttonText: { color: c.text, textAlign: 'center', fontWeight: '700', fontSize: 16 },
    passwordToggle: { alignSelf: 'flex-end', paddingVertical: space.md, paddingHorizontal: space.xs, minHeight: 44 },
    linkText: { color: c.accent, fontSize: 14, fontWeight: '600' },
    separator: { color: c.textMuted, textAlign: 'center', marginTop: space.lg },
    input: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 14, marginTop: space.md, fontSize: 16, color: c.text },
    preview: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#0f172a', marginTop: 20, borderRadius: radius.md },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: space.md },
    option: { padding: 14, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm },
    error: { color: c.danger, marginTop: space.md },
    success: { color: c.success, marginTop: space.md, fontWeight: '700' },
    disabled: { opacity: 0.45 },
  });
}
export type Ui = ReturnType<typeof makeUi>;

const lightUi = makeUi(light);
const darkUi = makeUi(dark);
// Estilos no tema claro, para telas que ainda não usam useUi().
export const ui = lightUi;
export function useUi(): Ui {
  return useColors() === dark ? darkUi : lightUi;
}
