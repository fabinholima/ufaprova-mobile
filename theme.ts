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
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
};

export const light: Palette = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  border: '#cbd5e1',
  text: '#0f172a',
  textMuted: '#475569',
  primary: '#0f172a',
  primaryText: '#ffffff',
  accent: '#2563eb',
  accentSoft: '#eff6ff',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  success: '#15803d',
  successSoft: '#f0fdf4',
  warning: '#b45309',
  warningSoft: '#fffbeb',
};

export const dark: Palette = {
  background: '#0b1120',
  surface: '#111827',
  surfaceMuted: '#1f2937',
  border: '#334155',
  text: '#f1f5f9',
  textMuted: '#cbd5e1',
  primary: '#3b82f6',
  primaryText: '#ffffff',
  accent: '#60a5fa',
  accentSoft: '#172554',
  danger: '#f87171',
  dangerSoft: '#450a0a',
  success: '#4ade80',
  successSoft: '#052e16',
  warning: '#fbbf24',
  warningSoft: '#451a03',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, pill: 999 };

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
