import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, radius, space, tabular, type } from './theme';
import { useUi } from './ui-styles';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// Tela com área segura, rolagem e, se houver onRefresh, "puxar para atualizar".
export function Screen({ children, refreshing = false, onRefresh, tabs }: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  // Barra de abas fixa no rodapé; a área segura inferior fica com ela.
  tabs?: ReactNode;
}) {
  const ui = useUi(), c = useColors();
  return (
    <SafeAreaView style={ui.safe} edges={tabs ? ['top', 'left', 'right'] : undefined}>
      <ScrollView
        contentContainerStyle={ui.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} /> : undefined}
      >
        {children}
      </ScrollView>
      {tabs}
    </SafeAreaView>
  );
}

// Cabeçalho da tela: marca, título e, opcionalmente, botão de voltar.
// status: estado curto à direita da marca (ex.: "Conectado"). Com online,
// aparece como selo com um ponto verde (conectado) ou âmbar (sem conexão).
export function Header({ title, subtitle, onBack, status, online }: { title: string; subtitle?: string; onBack?: () => void; status?: string; online?: boolean }) {
  const ui = useUi(), c = useColors();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, minHeight: 44 }}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} hitSlop={12} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginLeft: -6 }, pressed && ui.pressed]}>
          <Ionicons name="chevron-back" size={22} color={c.accent} />
          <Text style={ui.linkText}>Voltar</Text>
        </Pressable>
      ) : (
        <View accessible accessibilityLabel="UFA Prova" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Image testID="brand-logo" source={require('./assets/logo-mark.png')} style={{ width: 28, height: 28 }} />
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 }}>UFA Prova</Text>
        </View>
      )}
      {!!status && (online === undefined
        ? <Text numberOfLines={1} style={[ui.small, { marginTop: 0, flexShrink: 1, textAlign: 'right' }]}>{status}</Text>
        : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, backgroundColor: online ? c.surface : c.warningSoft, borderColor: online ? c.border : c.warningSoft, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? c.success : c.warning }} />
            <Text numberOfLines={1} style={{ color: online ? c.textMuted : c.warning, fontSize: type.caption, fontWeight: '600', flexShrink: 1 }}>{status}</Text>
          </View>
        ))}
      </View>
      <Text accessibilityRole="header" style={ui.title}>{title}</Text>
      {!!subtitle && <Text style={ui.small}>{subtitle}</Text>}
    </View>
  );
}

export type Tab<T extends string> = { key: T; label: string; icon: IconName; badge?: number };

export function TabBar<T extends string>({ tabs, current, onChange }: { tabs: Tab<T>[]; current: T; onChange: (key: T) => void }) {
  const c = useColors(), insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, space.sm) }}>
      {tabs.map((tab) => {
        const selected = tab.key === current;
        const color = selected ? c.accent : c.textMuted;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.badge ? `${tab.label}, ${tab.badge} pendente(s)` : tab.label}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', minHeight: 56, justifyContent: 'center', paddingTop: space.sm, opacity: pressed ? 0.7 : 1 })}
          >
            {/* Traço da aba atual, alinhado à borda superior da barra. */}
            <View style={{ position: 'absolute', top: -1, width: 28, height: 3, borderRadius: 2, backgroundColor: selected ? c.accent : 'transparent' }} />
            <View>
              <Ionicons name={selected ? tab.icon : (`${tab.icon}-outline` as IconName)} size={24} color={color} />
              {!!tab.badge && (
                <View style={{ position: 'absolute', top: -4, right: -12, minWidth: 18, height: 18, borderRadius: radius.pill, backgroundColor: c.danger, borderWidth: 2, borderColor: c.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', ...tabular }}>{tab.badge > 99 ? '99+' : tab.badge}</Text>
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={{ color, fontSize: 12, fontWeight: selected ? '700' : '500', marginTop: 2 }}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  const ui = useUi(), c = useColors();
  return (
    <View style={[ui.card, { alignItems: 'center', paddingVertical: space.xl, backgroundColor: c.surfaceMuted, borderStyle: 'dashed' }]}>
      <Ionicons name={icon} size={36} color={c.textMuted} />
      <Text style={[ui.cardTitle, { marginTop: space.sm, textAlign: 'center' }]}>{title}</Text>
      {!!text && <Text style={[ui.small, { textAlign: 'center' }]}>{text}</Text>}
      {children}
    </View>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'danger';
// Faixa de aviso com ícone (conexão, sincronização, erros).
// Com action, a faixa inteira vira um botão com o rótulo da ação à direita.
export function Notice({ tone = 'info', icon, children, action }: { tone?: Tone; icon?: IconName; children: ReactNode; action?: { label: string; onPress: () => void } }) {
  const c = useColors();
  const [fg, bg] = { info: [c.accent, c.accentSoft], success: [c.success, c.successSoft], warning: [c.warning, c.warningSoft], danger: [c.danger, c.dangerSoft] }[tone];
  const fallback: IconName = { info: 'information-circle', success: 'checkmark-circle', warning: 'alert-circle', danger: 'close-circle' }[tone] as IconName;
  const box = { flexDirection: 'row' as const, gap: space.sm, alignItems: 'flex-start' as const, backgroundColor: bg, borderRadius: radius.md, padding: space.md, marginTop: space.md };
  const body = <>
    <Ionicons name={icon || fallback} size={20} color={fg} />
    <Text style={{ color: fg, flex: 1, fontSize: 14, lineHeight: 20 }}>{children}</Text>
  </>;
  if (action) return (
    <Pressable accessibilityRole="button" accessibilityLiveRegion="polite" onPress={action.onPress} style={({ pressed }) => [box, { alignItems: 'center', minHeight: 52 }, pressed && { opacity: 0.75 }]}>
      {body}
      <Text style={{ color: fg, fontSize: 14, fontWeight: '700' }}>{action.label}</Text>
      <Ionicons name="chevron-forward" size={18} color={fg} />
    </Pressable>
  );
  return <View accessibilityLiveRegion="polite" style={box}>{body}</View>;
}

export function Loading({ label }: { label: string }) {
  const c = useColors();
  return <ActivityIndicator accessibilityLabel={label} color={c.accent} style={{ marginTop: space.xl }} />;
}

// Barra de progresso com rótulo acessível ("12 de 30").
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const c = useColors();
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max, now: value }} style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.surfaceMuted, marginTop: space.sm, overflow: 'hidden' }}>
      <View style={{ width: `${percent}%`, height: '100%', backgroundColor: percent >= 100 ? c.success : c.accent, borderRadius: radius.pill }} />
    </View>
  );
}

// Botão pequeno de filtro/seleção.
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => ({ paddingVertical: space.sm, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? c.accent : c.border, backgroundColor: selected ? c.accentSoft : c.surface, minHeight: 40, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: selected ? c.accent : c.text, fontWeight: '600', fontSize: 14, ...tabular }}>{label}</Text>
    </Pressable>
  );
}

// Progresso de uma turma como as bolhas de um cartão-resposta: uma bolha por
// aluno. Cheia em tinta: corrigido. Âmbar: foto no aparelho aguardando envio.
// Vazia: falta. Turmas muito grandes voltam para a barra.
export const BUBBLE_LIMIT = 60;
export function BubbleProgress({ completed, waiting = 0, students, label }: { completed: number; waiting?: number; students: number; label: string }) {
  const c = useColors();
  if (!students || students > BUBBLE_LIMIT) return <ProgressBar value={completed} max={students} label={label} />;
  const done = Math.min(completed, students), pending = Math.min(waiting, students - done);
  const full = done >= students;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: students, now: done }} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: space.md }}>
      {Array.from({ length: students }, (_, index) => {
        const fill = index < done ? (full ? c.success : c.accent) : index < done + pending ? c.mark : 'transparent';
        return <View key={index} style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: fill, borderWidth: 1.5, borderColor: fill === 'transparent' ? c.border : fill }} />;
      })}
    </View>
  );
}
