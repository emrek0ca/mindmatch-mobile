import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { useAppearance } from '../state/appearance';

const light = {
  ink: '#282A25', muted: '#74776D', faint: '#95988D', canvas: '#FFFFFF', white: '#FFFFFF', surface: '#F7F8F3',
  // Historical token names remain aliases so all screens share the same muted yellow palette.
  violet: '#C9C18E', violetDark: '#676747', lilac: '#E9E7D6', coral: '#C9C18E',
  green: '#70816E', amber: '#C9C18E', red: '#A66D6D', line: '#E8EAE1', night: '#151712',
  paleViolet: '#F3F2E8', paleCoral: '#F4F3ED', paleGreen: '#F0F3EC', paleBlue: '#F4F5F0', onAccent: '#282A25',
  glass: '#FFFFFFB8', glassTint: '#F5F4E821', accentSurface: '#EEECD9',
};
export type ThemeColors = { [K in keyof typeof light]: string };
const dark: ThemeColors = {
  ink: '#E9ECE2', muted: '#A1A599', faint: '#7B8072', canvas: '#000000', white: '#FFFFFF', surface: '#141610',
  violet: '#ADA77D', violetDark: '#C3BE95', lilac: '#323427', coral: '#ADA77D',
  green: '#96A38D', amber: '#ADA77D', red: '#BE9190', line: '#282B21', night: '#070906',
  paleViolet: '#1B1E15', paleCoral: '#1B1D17', paleGreen: '#181E15', paleBlue: '#171B14', onAccent: '#171A12',
  glass: '#0A0D08C7', glassTint: '#ADA77D12', accentSurface: '#292D1E',
};
export const colors = light;
export function useTheme() {
  const systemScheme = useColorScheme();
  const preference = useAppearance(state => state.preference);
  const isDark = preference === 'dark' || (preference === 'system' && systemScheme === 'dark');
  return { colors: isDark ? dark : light, isDark };
}
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (palette: ThemeColors) => T) {
  return function useThemedStyles() {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 } as const;
export const radius = { sm: 12, md: 16, lg: 24, pill: 999 } as const;

