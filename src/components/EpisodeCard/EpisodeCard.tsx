import { radii } from '../../theme/shape';
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

import { Episode } from '../../types/anime';

interface EpisodeCardProps {
  episode: Episode;
  onPress: (episode: Episode) => void;
  size?: 'small' | 'medium' | 'large';
  showProgress?: boolean;
}

const EpisodeCard: React.FC<EpisodeCardProps> = ({
  episode,
  onPress,
  size = 'medium',
  showProgress = true
}) => {
  const colorScheme = useColorScheme();

  const colors = palette[colorScheme ?? 'light'];

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          width: 160,
          thumbnailHeight: 90,
        };
      case 'large':
        return {
          width: 240,
          thumbnailHeight: 135,
        };
      default: // medium
        return {
          width: 200,
          thumbnailHeight: 112,
        };
    }
  };

  const sizeStyles = getSizeStyles();

  const getWatchStatusIcon = () => {
    if (episode.isWatched) return 'checkmark-circle';
    if (episode.watchProgress > 0) return 'play-circle';
    return 'ellipse-outline';
  };

  const getWatchStatusColor = () => {
    if (episode.isWatched) return colors.success;
    if (episode.watchProgress > 0) return colors.warning;
    return colors.textSecondary;
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <MotionPressable
      style={[
        styles.container,
        { backgroundColor: colors.background, borderColor: colors.background, width: sizeStyles.width }
      ]}
      onPress={() => onPress(episode)}
    >
      <View style={styles.thumbnailContainer}>
        <Image
          source={{ uri: episode.thumbnail || episode.anime_poster || '' }}
          style={[styles.thumbnail, { height: sizeStyles.thumbnailHeight }]}
        />

        {/* Overlay avec bouton play */}
        <View style={styles.overlay}>
          <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
        </View>

        {/* Indicateur de progression */}
        {showProgress && episode.watchProgress > 0 && !episode.isWatched && (
          <View style={styles.progressOverlay}>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.buttonBg,
                    width: `${Math.min(100, Math.max(0, episode.watchProgress))}%`
                  }
                ]}
              />
            </View>
          </View>
        )}

        {/* Durée */}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>
            {episode.duration > 0 ? formatDuration(episode.duration) : 'Épisode'}
          </Text>
        </View>

        {/* Statut de visionnage */}
        {showProgress && (
          <View style={styles.statusBadge}>
            <Ionicons
              name={getWatchStatusIcon()}
              size={16}
              color={getWatchStatusColor()}
            />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {episode.animeTitle || episode.title}
        </Text>

        <Text style={[styles.episodeNumber, { color: colors.textSecondary }]}>
          {Number(episode.num_saison) > 0 && Number(episode.num_saison) < 100 ? `S${episode.num_saison} · ` : ''}Épisode {episode.number}
        </Text>

        <Text style={[styles.duration, { color: colors.textSecondary }]}>
          {episode.duration > 0 ? `${Math.floor(episode.duration / 60)} min` : episode.langue || 'VOSTFR'}
        </Text>
      </View>
    </MotionPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 0,
    borderWidth: 0,
    marginRight: 14,
    overflow: 'hidden',
    elevation: 0,
    shadowOpacity: 0,
  },
  thumbnailContainer: { borderRadius: radii.card, overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    resizeMode: 'cover',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
  },
  progressBar: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 4,
    borderRadius: 12,
  },
  info: {
    paddingTop: 10, paddingHorizontal: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    lineHeight: 18,
  },
  episodeNumber: {
    fontSize: 12,
    marginBottom: 2,
  },
  duration: {
    fontSize: 11,
  },
});

export default EpisodeCard;
