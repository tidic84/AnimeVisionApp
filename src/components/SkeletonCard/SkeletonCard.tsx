import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, Platform, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useReducedMotion from '../../hooks/useReducedMotion';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';

const Phase = createContext<Animated.Value | null>(null);
function usePhase(enabled: boolean) {
  const reduced = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled || reduced) { phase.setValue(0); return; }
    const animation = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false }));
    animation.start();
    return () => { animation.stop(); phase.stopAnimation(); };
  }, [enabled, reduced, phase]);
  return phase;
}
/** Share a single native animation for a whole loading layout. */
export function SkeletonGroup({ children }: React.PropsWithChildren) {
  const phase = usePhase(true);
  return <Phase.Provider value={phase}>{children}</Phase.Provider>;
}
export function SkeletonBlock({ width = '100%', height = 16, style }: { width?: DimensionValue; height?: DimensionValue; style?: StyleProp<ViewStyle> }) {
  const colors = palette[useAppColorScheme()];
  const shared = useContext(Phase);
  const local = usePhase(!shared);
  const phase = shared || local;
  const reduced = useReducedMotion();
  const [measuredWidth, setMeasuredWidth] = useState(typeof width === 'number' ? width : 200);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onLayout={e => { const value = e.nativeEvent.layout.width; if (value > 0 && value !== measuredWidth) setMeasuredWidth(value); }} style={[{ width, height, backgroundColor: colors.surface, overflow: 'hidden', borderRadius: 3 }, style]}>
    {!reduced && <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: measuredWidth, transform: [{ translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [-measuredWidth, measuredWidth] }) }] }}><LinearGradient colors={['transparent', colors.border, 'transparent']} locations={[0, .5, 1]} style={{ flex: 1, opacity: .45 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} /></Animated.View>}
  </View>;
}
export default function SkeletonCard({ type = 'anime', size = 'medium' }: { type?: 'anime' | 'episode'; size?: 'small' | 'medium' | 'large' }) {
  const width = type === 'episode' ? (size === 'large' ? 240 : size === 'small' ? 160 : 200) : (size === 'large' ? 180 : size === 'small' ? 120 : 150);
  return <SkeletonGroup><View style={{ width, marginRight: 14 }}>
    <SkeletonBlock width={width} height={type === 'episode' ? width * 9 / 16 : width * 1.5} />
    <SkeletonBlock height={16} style={{ marginTop: 10 }} />
    <SkeletonBlock width="65%" height={12} style={{ marginTop: 8 }} />
  </View></SkeletonGroup>;
}
