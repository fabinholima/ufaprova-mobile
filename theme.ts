import { useColorScheme } from 'react-native';

// Cores, espaçamentos e raios usados por todas as telas. O tema segue o modo
// claro/escuro do aparelho.
export type Palette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  accent: string;
  accentSoft: string;
  // Âmbar da bolha marcada (logo e progresso).
  mark: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
};

// Paleta do cartão-resposta: papel frio, grafite, tinta azul da marca e o
// âmbar da bolha preenchida (só em preenchimentos, nunca em texto).
export const light: Palette = {
  background: '#f3f5f8',
  surface: '#ffffff',
  surfaceMuted: '#e9edf2',
  border: '#d5dbe3',
  text: '#18202b',
  textMuted: '#4f5b6b',
  primary: '#1e40af',
  primaryText: '#ffffff',
  accent: '#1e40af',
  accentSoft: '#e8eefc',
  mark: '#f5a524',
  danger: '#b42318',
  dangerSoft: '#fdeceb',
  success: '#157347',
  successSoft: '#e7f5ee',
  warning: '#9a5b00',
  warningSoft: '#fdf3e1',
};

export const dark: Palette = {
  background: '#0e141c',
  surface: '#16202b',
  surfaceMuted: '#1f2b38',
  border: '#2e3c4c',
  text: '#e8edf3',
  textMuted: '#a9b5c4',
  primary: '#3b63e0',
  primaryText: '#ffffff',
  accent: '#93b1ff',
  accentSoft: '#1a2a4d',
  mark: '#f5b13d',
  danger: '#ff8a80',
  dangerSoft: '#3d1512',
  success: '#5fd39a',
  successSoft: '#0f2e20',
  warning: '#f5c26b',
  warningSoft: '#33240a',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
// Escala de texto. Números de contagem usam algarismos tabulares (tabular).
export const type = { caption: 13, small: 14, body: 16, section: 19, title: 28 };
export const tabular = { fontVariant: ['tabular-nums' as const] };

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
