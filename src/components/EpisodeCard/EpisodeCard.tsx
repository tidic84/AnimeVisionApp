import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  useColorScheme,
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

  const colors = {
    light: {
      background: '#ffffff',
      text: '#1e293b',
      textSecondary: '#64748b',
      surface: '#f8fafc',
      border: '#e2e8f0',
      primary: '#6366f1',
      success: '#10b981',
      warning: '#f59e0b',
    },
    dark: {
      background: '#0f172a',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      surface: '#1e293b',
      border: '#334155',
      primary: '#818cf8',
      success: '#34d399',
      warning: '#fbbf24',
    },
  }[colorScheme ?? 'light'];

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
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: colors.surface, width: sizeStyles.width }
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
                    backgroundColor: colors.primary,
                    width: `${episode.watchProgress}%` 
                  }
                ]}
              />
            </View>
          </View>
        )}

        {/* Durée */}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>
            {formatDuration(episode.duration)}
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
          Épisode {episode.number}
        </Text>
        
        <Text style={[styles.duration, { color: colors.textSecondary }]}>
          {Math.floor(episode.duration / 60)} min
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  thumbnailContainer: {
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
    padding: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
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