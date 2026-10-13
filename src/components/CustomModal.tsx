import { radii } from '../theme/shape';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAppColorScheme } from '../contexts/ThemeContext';
import { palette } from '../theme/palette';
import useReducedMotion from '../hooks/useReducedMotion';

interface CustomModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  transparent?: boolean;
  alignment?: 'center' | 'bottom';
}
export default function CustomModal({ visible, onRequestClose, children, transparent = true, alignment = 'center' }: CustomModalProps) {
  const colors = palette[useAppColorScheme()];
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    if (visible) setMounted(true);
    if (reduced) { progress.setValue(visible ? 1 : 0); setMounted(visible); return; }
    const animation = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: visible ? 240 : 180, easing: visible ? Easing.bezier(.22, 1, .36, 1) : Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' });
    animation.start(({ finished }) => { if (finished && token === generation.current && !visible) setMounted(false); });
    return () => { generation.current++; animation.stop(); };
  }, [visible, reduced, progress]);
  return <Modal visible={mounted} animationType="none" transparent={transparent} onRequestClose={onRequestClose}>
    <View style={[styles.layout, alignment === 'bottom' && { justifyContent: 'flex-end' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress, backgroundColor: 'rgba(0,0,0,.65)' }]}><Pressable accessibilityRole="button" accessibilityLabel="Fermer la fenêtre" onPress={onRequestClose} style={{ flex: 1 }} /></Animated.View>
      <Animated.View accessibilityViewIsModal style={[styles.content, { backgroundColor: colors.surface, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [alignment === 'bottom' ? 32 : 8, 0] }) }] }, alignment === 'bottom' && styles.bottom]}>{children}</Animated.View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ layout: { flex: 1, justifyContent: 'center', alignItems: 'center' }, content: { width: '90%', maxWidth: 560, maxHeight: '85%', borderRadius: radii.sheet, overflow: 'hidden' }, bottom: { width: '100%', maxWidth: 900, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } });
