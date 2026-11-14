import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SkeletonBlock, SkeletonGroup } from '../../components/SkeletonCard/SkeletonCard';
import { palette } from '../../theme/palette';
import { radii } from '../../theme/shape';

/** Blocks drawn over the hero's dark gradient: the real hero text is always on a dark background. */
const onDark = { backgroundColor: 'rgba(255,255,255,.12)' };

/**
 * Same frame as HeroCarousel: full-bleed slide, gradient towards the background,
 * text block anchored at the bottom (badge, title, metadata, 3 lines, actions) and the progress tracks.
 */
export function HeroSkeleton({ width, height }: { width: number; height: number }) {
  return <SkeletonGroup><View style={{ width, height, overflow: 'hidden' }}>
    <SkeletonBlock width={width} height={height} style={styles.fill} />
    <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,.18)', palette.dark.background]} locations={[0, .35, .79]} style={StyleSheet.absoluteFill} />
    <View style={styles.heroContent}>
      <SkeletonBlock width={118} height={26} style={[onDark, { borderRadius: radii.pill }]} />
      <SkeletonBlock width="72%" height={30} style={[onDark, { marginVertical: 3.5 }]} />
      <SkeletonBlock width="45%" height={12} style={[onDark, { marginVertical: 2 }]} />
      <View style={{ gap: 7, paddingVertical: 3.5 }}>
        <SkeletonBlock height={14} style={onDark} />
        <SkeletonBlock height={14} style={onDark} />
        <SkeletonBlock width="68%" height={14} style={onDark} />
      </View>
      <View style={styles.heroActions}>
        <SkeletonBlock width={190} height={46} style={[onDark, { borderRadius: radii.pill }]} />
        <SkeletonBlock width={46} height={46} style={[onDark, { borderRadius: radii.pill }]} />
      </View>
    </View>
    <View style={styles.tracks}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={styles.track} />)}</View>
  </View></SkeletonGroup>;
}

/** Section title placeholder, same height as the 21/26 title text. */
export function TitleSkeleton() {
  return <SkeletonBlock width={190} height={20} style={{ marginVertical: 3 }} />;
}

/** Same footprint as AnimeCard size="medium": 150 x 225 poster, 2 title lines, genres. */
function AnimeCardSkeleton() {
  return <View style={{ width: 150, marginRight: 14 }}>
    <SkeletonBlock width={150} height={225} />
    <View style={{ paddingTop: 10, height: 36 + 10 + 6, gap: 6, paddingBottom: 6 }}>
      <SkeletonBlock height={13} />
      <SkeletonBlock width="60%" height={13} />
    </View>
    <SkeletonBlock width="45%" height={10} style={{ marginTop: 2, marginBottom: 7 }} />
  </View>;
}

/** Same footprint as EpisodeCard size="medium": 200 x 112 thumbnail, 2 title lines, number, duration. */
function EpisodeCardSkeleton() {
  return <View style={{ width: 200, marginRight: 14 }}>
    <SkeletonBlock width={200} height={112} />
    <View style={{ paddingTop: 10, height: 36 + 10 + 4, gap: 6, paddingBottom: 4 }}>
      <SkeletonBlock height={13} />
      <SkeletonBlock width="55%" height={13} />
    </View>
    <SkeletonBlock width="40%" height={11} style={{ marginTop: 2, marginBottom: 5 }} />
    <SkeletonBlock width="25%" height={10} style={{ marginTop: 2, marginBottom: 3 }} />
  </View>;
}

/** A horizontal row of card placeholders, as many as the screen shows. */
export function RowSkeleton({ kind, width }: { kind: 'anime' | 'episode'; width: number }) {
  const count = Math.max(2, Math.ceil((width - 18) / (kind === 'anime' ? 164 : 214)));
  const Card = kind === 'anime' ? AnimeCardSkeleton : EpisodeCardSkeleton;
  return <SkeletonGroup><View style={styles.row}>{Array.from({ length: count }, (_, i) => <Card key={i} />)}</View></SkeletonGroup>;
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, borderRadius: 0 },
  heroContent: { position: 'absolute', left: 18, right: 18, bottom: 46, gap: 12, maxWidth: 700 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tracks: { position: 'absolute', left: 18, bottom: 18, flexDirection: 'row', gap: 6 },
  track: { width: 28, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.32)' },
  row: { flexDirection: 'row', paddingHorizontal: 18, overflow: 'hidden' },
});
