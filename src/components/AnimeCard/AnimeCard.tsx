import { useAppColorScheme as useColorScheme } from '../../contexts/ThemeContext';
import { MotionPressable } from '../Motion';
import { palette } from '../../theme/palette';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
          thumbnailHeight: 160,
        };
      case 'large':
        return {
          width: 180,
          thumbnailHeight: 240,
        };
      default: // medium
        return {
          width: 150,
          thumbnailHeight: 200,
        };
    }
  };

  const sizeStyles = getSizeStyles();

  return (
    <MotionPressable
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border, width: sizeStyles.width }
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

        <View style={styles.metadata}>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={12} color="#fbbf24" />
            <Text style={[styles.rating, { color: colors.textSecondary }]}>
              {anime.rating > 0 ? anime.rating.toFixed(1) : '—'}
            </Text>
          </View>

          <Text style={[styles.year, { color: colors.textSecondary }]}>
            {anime.year > 1900 ? anime.year : '—'}
          </Text>
        </View>

        <Text style={[styles.genres, { color: colors.textSecondary }]} numberOfLines={1}>
          {(anime.genres || []).slice(0, 2).join(', ')}
        </Text>

        <View style={styles.statusContainer}>
          <Text style={[styles.episodeCount, { color: colors.textSecondary }]}>
            {anime.episodeCount > 0 ? `${anime.episodeCount} épisodes` : 'À découvrir'}
          </Text>
        </View>
      </View>
    </MotionPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 14,
    overflow: 'hidden',
    elevation: 0,
    shadowOpacity: 0,
  },
  thumbnail: {
    width: '100%',
    resizeMode: 'cover',
  },
  info: {
    padding: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
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
