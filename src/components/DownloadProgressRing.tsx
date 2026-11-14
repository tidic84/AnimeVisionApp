import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import useReducedMotion from '../hooks/useReducedMotion';
import { motion } from '../theme/tokens';

const nativeDriver = Platform.OS !== 'web';
// Longueur de l'arc qui tourne tant que la taille totale est inconnue.
const SPINNER_ARC = 28;

type Props = React.PropsWithChildren<{
  /** 0-100 pour suivre l'avancement ; null tant que la taille totale est inconnue (anneau qui tourne). */
  progress: number | null;
  color: string;
  trackColor: string;
  size?: number;
  thickness?: number;
}>;

/**
 * Anneau de progression sans SVG : chaque moitié du cercle est un demi-anneau
 * qui pivote derrière un masque (overflow hidden). La moitié droite couvre
 * 0-50 %, la gauche 50-100 %, et les rotations passent par le pilote natif.
 */
export default function DownloadProgressRing({ progress, color, trackColor, size = 24, thickness = 2.5, children }: Props) {
  const reduced = useReducedMotion();
  const indeterminate = progress === null;
  const target = indeterminate ? SPINNER_ARC : Math.min(100, Math.max(0, progress));
  const value = useRef(new Animated.Value(target)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) { value.setValue(target); return; }
    const animation = Animated.timing(value, { toValue: target, duration: motion.duration.long, easing: motion.easing.standard, useNativeDriver: nativeDriver });
    animation.start();
    return () => animation.stop();
  }, [reduced, target, value]);

  useEffect(() => {
    spin.setValue(0);
    if (!indeterminate || reduced) return;
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: nativeDriver }));
    animation.start();
    return () => { animation.stop(); spin.setValue(0); };
  }, [indeterminate, reduced, spin]);

  const half = size / 2;
  const ring = { width: size, height: size, borderRadius: half, borderWidth: thickness, borderColor: color };
  const right = value.interpolate({ inputRange: [0, 50, 100], outputRange: ['0deg', '180deg', '180deg'] });
  const left = value.interpolate({ inputRange: [0, 50, 100], outputRange: ['0deg', '0deg', '180deg'] });
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // Sans animation, un arc figé ferait croire à un pourcentage : seul le rail reste.
  const showArc = !(indeterminate && reduced);

  return <View style={{ width: size, height: size }} pointerEvents="none">
    <View style={[StyleSheet.absoluteFill, ring, { borderColor: trackColor }]} />
    {showArc && <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotation }] }]}>
      <View style={{ position: 'absolute', left: half, top: 0, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', left: -half, top: 0, width: size, height: size, transform: [{ rotate: right }] }}>
          <View style={{ position: 'absolute', left: 0, top: 0, width: half, height: size, overflow: 'hidden' }}><View style={ring} /></View>
        </Animated.View>
      </View>
      <View style={{ position: 'absolute', left: 0, top: 0, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: [{ rotate: left }] }}>
          <View style={{ position: 'absolute', left: half, top: 0, width: half, height: size, overflow: 'hidden' }}><View style={[ring, { position: 'absolute', left: -half, top: 0 }]} /></View>
        </Animated.View>
      </View>
    </Animated.View>}
    {children ? <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View> : null}
  </View>;
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
