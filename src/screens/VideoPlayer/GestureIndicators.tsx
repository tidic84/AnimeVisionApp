import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { palette } from '../../theme/palette';
import { radii } from '../../theme/shape';
import type { GestureSide } from '../../utils/playerGestures';

const colors = palette.dark;

const iconFor = (side: GestureSide, value: number): React.ComponentProps<typeof MaterialIcons>['name'] => {
  if (side === 'brightness') return value < 0.34 ? 'brightness-low' : value < 0.67 ? 'brightness-medium' : 'brightness-high';
  return value <= 0 ? 'volume-off' : value < 0.5 ? 'volume-down' : 'volume-up';
};

// Indicateur affiché pendant un glissement : icône, barre verticale et pourcentage, du côté du geste.
export function LevelIndicator({ side, value, large, inset }: { side: GestureSide; value: number; large: boolean; inset: number }) {
  const percent = Math.round(value * 100);
  return <View pointerEvents="none" accessibilityLiveRegion="polite" accessibilityLabel={`${side === 'brightness' ? 'Luminosité' : 'Volume'} ${percent} %`}
    style={[styles.levelWrap, side === 'brightness' ? { left: inset } : { right: inset }]}>
    <View style={[styles.level, large && { paddingVertical: 14, gap: 10 }]}>
      <MaterialIcons name={iconFor(side, value)} color="white" size={large ? 24 : 20} />
      <View style={[styles.bar, { height: large ? 140 : 72 }]}><View style={[styles.barFill, { height: `${percent}%` }]} /></View>
      <Text style={styles.levelText}>{percent}</Text>
    </View>
  </View>;
}

// Badge « 2x » en haut de la vidéo tant que l'appui long dure.
export function BoostBadge({ top }: { top: number }) {
  return <View pointerEvents="none" accessibilityLiveRegion="polite" accessibilityLabel="Lecture en vitesse 2x" style={[styles.badgeWrap, { top }]}>
    <View style={styles.badge}><Text style={styles.badgeText}>2x</Text><MaterialIcons name="fast-forward" color="white" size={16} /></View>
  </View>;
}

const styles = StyleSheet.create({
  levelWrap: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  level: { alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radii.control, backgroundColor: 'rgba(0,0,0,0.6)' },
  bar: { width: 4, borderRadius: 2, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.24)' },
  barFill: { width: 4, backgroundColor: colors.primary },
  levelText: { color: 'white', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badgeWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: 'rgba(0,0,0,0.6)' },
  badgeText: { color: 'white', fontSize: 14, fontWeight: '700' },
});
