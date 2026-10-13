import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleProp, ViewStyle, PressableProps, Platform } from 'react-native';
import useReducedMotion from '../hooks/useReducedMotion';

export function FadeIn({ children, style, delay = 0 }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle>; delay?: number }>) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 420, delay, useNativeDriver: Platform.OS !== 'web' });
    animation.start();
    return () => animation.stop();
  }, [reduced, delay, progress]);
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>{children}</Animated.View>;
}

export function MotionPressable({ children, style, ...props }: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (value: number) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: value, speed: 28, bounciness: 3, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  useEffect(() => { if (reduced) scale.setValue(1); return () => scale.stopAnimation(); }, [reduced, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" {...props} style={style} onPressIn={event => { animate(0.975); props.onPressIn?.(event); }} onPressOut={event => { animate(1); props.onPressOut?.(event); }}>{children}</Pressable></Animated.View>;
}
