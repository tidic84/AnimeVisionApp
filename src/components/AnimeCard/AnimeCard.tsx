import { radii } from '../../theme/shape';
import { useAppColorScheme as useColorScheme } from '../../contexts/ThemeContext';
import { MotionPressable } from '../Motion';
import { palette } from '../../theme/palette';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';

import { Anime } from '../../types/anime';

interface AnimeCardProps {
  anime: Anime;
  onPress: (animeId: string) => void;
  size?: 'small' | 'medium' | 'large';
}

const AnimeCard: React.FC<AnimeCardProps> = ({ anime, onPress, size = 'medium' }) => {
  const colorScheme = useColorScheme();

  const colors = palette[colorScheme ?? 'light'];

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          width: 120,
          thumbnailHeight: 180,
        };
      case 'large':
        return {
          width: 180,
          thumbnailHeight: 270,
        };
      default: // medium
        return {
          width: 150,
          thumbnailHeight: 225,
        };
    }
  };

  const sizeStyles = getSizeStyles();

  return (
    <MotionPressable
      style={[
        styles.container,
        { backgroundColor: colors.background, borderColor: colors.background, width: sizeStyles.width }
      ]}
      onPress={() => onPress(anime.id)}
    >
      <Image
        source={{ uri: anime.thumbnail }}
        style={[styles.thumbnail, { height: sizeStyles.thumbnailHeight }]}
      />

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {anime.title}
        </Text>

        <Text style={[styles.genres, { color: colors.textSecondary }]} numberOfLines={1}>
          {(anime.genres || []).slice(0, 2).join(', ')}
        </Text>


      </View>
    </MotionPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.card,
    borderWidth: 0,
    marginRight: 14,
    overflow: 'hidden',
    elevation: 0,
    shadowOpacity: 0,
  },
  thumbnail: { borderRadius: radii.card,
    width: '100%',
    resizeMode: 'cover',
  },
  info: {
    paddingTop: 10, paddingHorizontal: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    lineHeight: 18,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  rating: {
    fontSize: 12,
    marginLeft: 2,
    fontWeight: '500',
  },
  year: {
    fontSize: 12,
  },
  genres: {
    fontSize: 11,
    marginBottom: 4,
  },
  statusContainer: {
    marginTop: 2,
  },
  episodeCount: {
    fontSize: 11,
    fontWeight: '500',
  },
});

export default AnimeCard;
