import { radii } from '../../theme/shape';
import { useAppColorScheme as useColorScheme } from '../../contexts/ThemeContext';
import { MotionPressable } from '../Motion';
import { palette } from '../../theme/palette';
import { typography } from '../../theme/tokens';
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

import { Anime } from '../../types/anime';

interface AnimeCardProps {
  anime: Anime;
  onPress: (animeId: string) => void;
  size?: 'small' | 'medium' | 'large';
}

// Affiche 2:3, couverture généreuse.
const SIZES = { small: 120, medium: 156, large: 188 } as const;

const AnimeCard: React.FC<AnimeCardProps> = ({ anime, onPress, size = 'medium' }) => {
  const colors = palette[useColorScheme() ?? 'light'];
  const width = SIZES[size];
  const genres = (anime.genres || []).slice(0, 2);

  return (
    <MotionPressable
      hoverScale={1.04}
      style={[styles.container, { width }]}
      onPress={() => onPress(anime.id)}
      accessibilityLabel={[anime.title, ...genres].join(', ')}
      accessibilityHint="Ouvre la fiche de l’animé"
    >
      {/* Fond de surface : la place de la couverture reste visible pendant son chargement. */}
      <Image source={{ uri: anime.thumbnail }} style={[styles.thumbnail, { height: width * 1.5, backgroundColor: colors.surface }]} />
      <View style={styles.info}>
        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={2}>{anime.title}</Text>
        {genres.length > 0 && <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>{genres.join(' · ')}</Text>}
      </View>
    </MotionPressable>
  );
};

const styles = StyleSheet.create({
  container: { marginRight: 14 },
  thumbnail: { borderRadius: radii.card, width: '100%', resizeMode: 'cover' },
  info: { paddingTop: 10 },
});

export default AnimeCard;
