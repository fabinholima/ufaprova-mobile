import { StyleSheet } from 'react-native';
import { dark, light, radius, space, tabular, type, useColors } from './theme';
import type { Palette } from './theme';

function makeUi(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: space.lg, paddingBottom: 32 },
    // Rótulo curto acima de um grupo (sem caixa alta).
    eyebrow: { color: c.textMuted, fontWeight: '600', fontSize: type.small },
    title: { color: c.text, fontSize: type.title, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: space.lg },
    // Título de grupo dentro de uma tela (ex.: Aplicações, Em andamento).
    sectionTitle: { color: c.text, fontSize: type.section, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2, marginTop: 28 },
    count: { color: c.textMuted, fontWeight: '600', ...tabular },
    text: { color: c.textMuted, fontSize: type.body, lineHeight: 24, marginTop: space.md },
    small: { color: c.textMuted, fontSize: type.small, lineHeight: 20, marginTop: space.xs },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: space.lg, marginTop: space.md },
    cardTitle: { color: c.text, fontWeight: '700', fontSize: 17, lineHeight: 22 },
    selected: { borderColor: c.accent, backgroundColor: c.accentSoft },
    primary: { backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg, marginTop: space.lg, minHeight: 52, justifyContent: 'center' },
    primaryText: { color: c.primaryText, textAlign: 'center', fontWeight: '700', fontSize: 16 },
    secondary: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg, marginTop: space.md, minHeight: 52, justifyContent: 'center' },
    buttonText: { color: c.text, textAlign: 'center', fontWeight: '600', fontSize: 16 },
    passwordToggle: { alignSelf: 'flex-end', paddingVertical: space.md, paddingHorizontal: space.xs, minHeight: 44 },
    linkText: { color: c.accent, fontSize: 15, fontWeight: '600' },
    separator: { color: c.textMuted, textAlign: 'center', marginTop: space.lg },
    input: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg, minHeight: 52, marginTop: space.md, fontSize: 16, color: c.text },
    preview: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#0e141c', marginTop: 20, borderRadius: radius.md },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: space.md },
    option: { padding: 14, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm },
    error: { color: c.danger, marginTop: space.md },
    success: { color: c.success, marginTop: space.md, fontWeight: '700' },
    disabled: { opacity: 0.45 },
    // Retorno ao toque em Pressable: style={({ pressed }) => [..., pressed && ui.pressed]}.
    pressed: { opacity: 0.72 },
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
