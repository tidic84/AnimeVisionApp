import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppColorScheme } from '../contexts/ThemeContext';
import { palette } from '../theme/palette';
import { radii } from '../theme/shape';

/** Barre « action faite · Annuler » en bas de l'écran, fermée seule après quelques secondes. */
export default function UndoBar({ message, onUndo, onClose, duration = 7000 }: { message: string; onUndo: () => void; onClose: () => void; duration?: number }) {
  const colors = palette[useAppColorScheme() ?? 'dark'];
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message]);
  return <View accessibilityLiveRegion="polite" style={[styles.bar, { bottom: 16 + insets.bottom, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
    <Text style={{ color: colors.text, flex: 1 }}>{message}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => { onUndo(); onClose(); }} style={styles.button}><Text style={{ color: colors.primary, fontWeight: '700' }}>Annuler</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, borderRadius: radii.panel, borderWidth: 1, zIndex: 20, elevation: 8 },
  button: { paddingHorizontal: 14, paddingVertical: 10 },
});
