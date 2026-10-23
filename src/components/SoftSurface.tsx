import { type PropsWithChildren, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useTheme } from '../theme/tokens';

// Native frost on supported iOS versions; a quiet translucent surface elsewhere.
// Keep blur on small floating controls, never the scrolling feed or message bubbles.
export function SoftSurface({ children, style, media = false, animate = false }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; media?: boolean; animate?: boolean }>) {
  const { colors, isDark } = useTheme();
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    if (Platform.OS !== 'ios') return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (active) setReduceTransparency(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { active = false; subscription.remove(); };
  }, []);
  const nativeGlass = Platform.OS === 'ios' && !reduceTransparency && isLiquidGlassAvailable();
  const backgroundColor = reduceTransparency && Platform.OS === 'ios' ? media ? '#151712' : colors.surface : media ? '#10130D99' : colors.glass;
  return <Animated.View entering={animate ? FadeIn.duration(240).reduceMotion(ReduceMotion.System) : undefined} style={[style, { overflow: 'hidden' }]}>
    {nativeGlass ? <GlassView pointerEvents="none" style={StyleSheet.absoluteFill} colorScheme={media || isDark ? 'dark' : 'light'} glassEffectStyle="clear" tintColor={media ? '#15171244' : colors.glassTint} /> : <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor }]} />}
    {children}
  </Animated.View>;
}
