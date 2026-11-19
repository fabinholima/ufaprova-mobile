import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, radius, space } from './theme';
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
// status: linha curta à direita da marca (ex.: conta e conexão).
export function Header({ title, subtitle, onBack, status }: { title: string; subtitle?: string; onBack?: () => void; status?: string }) {
  const ui = useUi(), c = useColors();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' }}>
          <Ionicons name="chevron-back" size={22} color={c.accent} />
          <Text style={ui.linkText}>Voltar</Text>
        </Pressable>
      ) : (
        <Text style={ui.eyebrow}>UFA PROVA</Text>
      )}
      {!!status && <Text numberOfLines={1} style={[ui.small, { marginTop: 0, flexShrink: 1, textAlign: 'right' }]}>{status}</Text>}
      </View>
      <Text accessibilityRole="header" style={[ui.title, onBack && { marginTop: space.sm }]}>{title}</Text>
      {!!subtitle && <Text style={ui.small}>{subtitle}</Text>}
    </View>
  );
}

export type Tab<T extends string> = { key: T; label: string; icon: IconName; badge?: number };

export function TabBar<T extends string>({ tabs, current, onChange }: { tabs: Tab<T>[]; current: T; onChange: (key: T) => void }) {
  const c = useColors(), insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, space.sm), paddingTop: space.sm }}>
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
            style={{ flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' }}
          >
            <View>
              <Ionicons name={selected ? tab.icon : (`${tab.icon}-outline` as IconName)} size={24} color={color} />
              {!!tab.badge && (
                <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: radius.pill, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{tab.badge > 99 ? '99+' : tab.badge}</Text>
                </View>
              )}
            </View>
            <Text style={{ color, fontSize: 12, fontWeight: selected ? '700' : '500', marginTop: 2 }}>{tab.label}</Text>
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
export function Notice({ tone = 'info', icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  const c = useColors();
  const [fg, bg] = { info: [c.accent, c.accentSoft], success: [c.success, c.successSoft], warning: [c.warning, c.warningSoft], danger: [c.danger, c.dangerSoft] }[tone];
  const fallback: IconName = { info: 'information-circle', success: 'checkmark-circle', warning: 'alert-circle', danger: 'close-circle' }[tone] as IconName;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', backgroundColor: bg, borderRadius: radius.md, padding: space.md, marginTop: space.md }}>
      <Ionicons name={icon || fallback} size={20} color={fg} />
      <Text style={{ color: fg, flex: 1, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const c = useColors();
  return <ActivityIndicator accessibilityLabel={label} color={c.accent} style={{ marginTop: space.xl }} />;
}
