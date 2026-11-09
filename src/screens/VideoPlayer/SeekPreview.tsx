import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { palette } from '../../theme/palette';
import { radii } from '../../theme/shape';
import { cueAt, Storyboard } from '../../services/seekPreview';

const colors = palette.dark;

type Props = {
  time: number;
  label: string;
  /** Position du curseur et largeur de la barre, en px. */
  x: number;
  barWidth: number;
  storyboard: Storyboard | null;
  headers?: Record<string, string>;
  large: boolean;
};

/** Bulle au-dessus du curseur pendant le glisser : vignette de la planche de l'hébergeur quand elle existe, sinon le temps visé seul. */
export default function SeekPreview({ time, label, x, barWidth, storyboard, headers, large }: Props) {
  const cue = storyboard ? cueAt(storyboard.cues, time) : undefined;
  const size = cue && storyboard?.sizes[cue.url];
  const width = cue && size ? (large ? 240 : 160) : 0;
  const bubble = width ? width + 4 : large ? 72 : 60;
  const left = Math.max(0, Math.min(barWidth - bubble, x - bubble / 2));
  return <View pointerEvents="none" style={[styles.wrap, { left, width: bubble }]}>
    {cue && size && <View style={[styles.frame, { width: width + 4, height: width * (cue.h || 9) / (cue.w || 16) + 4 }]}>
      {/* La planche entière, agrandie puis décalée : seule la vignette du moment reste dans le cadre. */}
      <Image fadeDuration={0} source={{ uri: cue.url, headers }} style={cue.w
        ? { position: 'absolute', width: size.width * width / cue.w, height: size.height * width / cue.w, left: -cue.x * width / cue.w, top: -cue.y * width / cue.w }
        : StyleSheet.absoluteFill} resizeMode={cue.w ? 'stretch' : 'cover'} />
    </View>}
    <Text style={[styles.time, large && { fontSize: 15 }]}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 36, alignItems: 'center', gap: 6 },
  frame: { overflow: 'hidden', borderRadius: radii.poster, borderWidth: 2, borderColor: 'white', backgroundColor: colors.surface },
  time: { color: 'white', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: 'rgba(15,16,22,0.85)', overflow: 'hidden' },
});
