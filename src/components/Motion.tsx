import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleProp, ViewStyle, PressableProps, Platform, StyleSheet, View } from 'react-native';
import useReducedMotion from '../hooks/useReducedMotion';
import { motion } from '../theme/tokens';
const nativeDriver = Platform.OS !== 'web';
const easeOut = motion.easing.decelerate;

export function FadeIn({ children, style, delay = 0 }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle>; delay?: number }>) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const revealed = useRef(false);
  useEffect(() => {
    if (reduced || revealed.current) { progress.setValue(1); return; }
    revealed.current = true;
    const animation = Animated.timing(progress, { toValue: 1, duration: motion.duration.medium, delay, easing: easeOut, useNativeDriver: nativeDriver });
    animation.start();
    return () => animation.stop();
  }, [reduced, delay, progress]);
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>{children}</Animated.View>;
}

/** Keep the skeleton until content has mounted, then overlap their short fades. */
export function LoadingSwap({ loading, skeleton, children, style }: React.PropsWithChildren<{ loading: boolean; skeleton: React.ReactNode; style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion();
  const [showSkeleton, setShowSkeleton] = useState(loading);
  const contentOpacity = useRef(new Animated.Value(loading ? 0 : 1)).current;
  const skeletonOpacity = useRef(new Animated.Value(loading ? 1 : 0)).current;
  const sequence = useRef(0);
  const previousHeight = useRef(0);
  useEffect(() => {
    const token = ++sequence.current;
    contentOpacity.stopAnimation(); skeletonOpacity.stopAnimation();
    if (loading) {
      setShowSkeleton(true); contentOpacity.setValue(0); skeletonOpacity.setValue(1);
      return;
    }
    if (reduced) { contentOpacity.setValue(1); skeletonOpacity.setValue(0); setShowSkeleton(false); return; }
    const animation = Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: motion.duration.medium, easing: easeOut, useNativeDriver: nativeDriver }),
      Animated.timing(skeletonOpacity, { toValue: 0, duration: motion.duration.short, easing: motion.easing.accelerate, useNativeDriver: nativeDriver }),
    ]);
    animation.start(({ finished }) => { if (finished && token === sequence.current) setShowSkeleton(false); });
    return () => { sequence.current++; animation.stop(); };
  }, [loading, reduced, contentOpacity, skeletonOpacity]);
  const fills = Boolean(StyleSheet.flatten(style)?.flex);
  return <View style={[style, fills && { overflow: 'hidden' }, loading && !fills && previousHeight.current > 0 && { minHeight: previousHeight.current }]}>
    <Animated.View onLayout={event => { if (!loading) previousHeight.current = event.nativeEvent.layout.height; }} pointerEvents={loading ? 'none' : 'auto'} accessibilityElementsHidden={loading} importantForAccessibility={loading ? 'no-hide-descendants' : 'auto'} style={[fills && { flex: 1 }, loading && StyleSheet.absoluteFill, { opacity: contentOpacity }]}>{children}</Animated.View>
    {showSkeleton && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[fills && { flex: 1 }, !loading && StyleSheet.absoluteFill, { opacity: skeletonOpacity }]}>{skeleton}</Animated.View>}
  </View>;
}

/** `hoverScale` : léger agrandissement au survol de la souris (Windows / web), pour les cartes. */
export function MotionPressable({ children, style, pressedScale = 0.98, hoverScale = 1, ...props }: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children: React.ReactNode; pressedScale?: number; hoverScale?: number }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const hovered = useRef(false);
  const animate = (value: number) => {
    if (reduced || props.disabled) return;
    Animated.spring(scale, { toValue: value, stiffness: 420, damping: 32, mass: 0.7, overshootClamping: true, useNativeDriver: nativeDriver }).start();
  };
  const rest = () => hovered.current ? hoverScale : 1;
  useEffect(() => { if (reduced) scale.setValue(1); return () => scale.stopAnimation(); }, [reduced, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" {...props} style={style}
    onHoverIn={event => { hovered.current = true; animate(hoverScale); props.onHoverIn?.(event); }}
    onHoverOut={event => { hovered.current = false; animate(1); props.onHoverOut?.(event); }}
    onPressIn={event => { animate(pressedScale); props.onPressIn?.(event); }} onPressOut={event => { animate(rest()); props.onPressOut?.(event); }}>{children}</Pressable></Animated.View>;
}
