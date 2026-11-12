import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppColorScheme } from '../contexts/ThemeContext';
import { palette } from '../theme/palette';
import { typography } from '../theme/tokens';

/** Titre d'étagère commun (accueil, scans) : titre, sous-titre facultatif et action à droite. */
export default function SectionHeader({ title, subtitle, action, gutter }: { title: string; subtitle?: string; action?: React.ReactNode; gutter: number }) {
  const colors = palette[useAppColorScheme()];
  return <View style={[styles.row, { paddingHorizontal: gutter }]}>
    <View style={{ flex: 1 }}>
      <Text accessibilityRole="header" style={[typography.section, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[typography.body, { color: colors.textSecondary, marginTop: 2 }]}>{subtitle}</Text> : null}
    </View>
    {action}
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 14 } });
