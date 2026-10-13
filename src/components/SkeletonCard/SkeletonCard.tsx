import { useAppColorScheme as useColorScheme } from '../../contexts/ThemeContext';
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, } from 'react-native';
import useReducedMotion from '../../hooks/useReducedMotion';
import { palette } from '../../theme/palette';

interface SkeletonCardProps {
  type?: 'anime' | 'episode';
  size?: 'small' | 'medium' | 'large';
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({
  type = 'anime',
  size = 'medium'
}) => {
  const colorScheme = useColorScheme();
  const reducedMotion = useReducedMotion();
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) { pulseAnim.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: false,
        }),
      ]));
    animation.start();
    return () => animation.stop();
  }, [pulseAnim, reducedMotion]);

  const backgroundColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      palette[colorScheme ?? 'light'].surface,
      palette[colorScheme ?? 'light'].border,
    ],
  });

  const getCardDimensions = () => {
    switch (size) {
      case 'small':
        return { width: 140, height: 200 };
      case 'large':
        return { width: 180, height: 240 };
      default: // medium
        return { width: 150, height: 200 };
    }
  };

  const dimensions = getCardDimensions();

  if (type === 'episode') {
    return (
      <View style={[styles.episodeContainer, { width: dimensions.width + 50 }]}>
        {/* Thumbnail */}
        <Animated.View
          style={[
            styles.episodeThumbnail,
            { backgroundColor, width: dimensions.width, height: dimensions.height * 0.6 }
          ]}
        />

        {/* Episode Info */}
        <View style={styles.episodeInfo}>
          <Animated.View
            style={[styles.skeletonText, styles.episodeTitle, { backgroundColor }]}
          />
          <Animated.View
            style={[styles.skeletonText, styles.episodeSubtitle, { backgroundColor }]}
          />

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <Animated.View
              style={[styles.progressBar, { backgroundColor }]}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.animeContainer, dimensions]}>
      {/* Poster Image */}
      <Animated.View
        style={[
          styles.animePoster,
          { backgroundColor, width: dimensions.width, height: dimensions.height * 0.75 }
        ]}
      />

      {/* Title */}
      <View style={styles.animeInfo}>
        <Animated.View
          style={[styles.skeletonText, styles.animeTitle, { backgroundColor }]}
        />
        <Animated.View
          style={[styles.skeletonText, styles.animeSubtitle, { backgroundColor }]}
        />
      </View>

      {/* Rating */}
      <View style={styles.ratingContainer}>
        <Animated.View
          style={[styles.skeletonText, styles.rating, { backgroundColor }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Anime Card Skeleton
  animeContainer: {
    marginHorizontal: 8,
    marginVertical: 4,
  },
  animePoster: {
    borderRadius: 12,
    marginBottom: 8,
  },
  animeInfo: {
    paddingHorizontal: 4,
  },
  animeTitle: {
    height: 16,
    borderRadius: 4,
    marginBottom: 6,
  },
  animeSubtitle: {
    height: 12,
    width: '70%',
    borderRadius: 4,
    marginBottom: 4,
  },
  ratingContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  rating: {
    width: 40,
    height: 20,
    borderRadius: 10,
  },

  // Episode Card Skeleton
  episodeContainer: {
    flexDirection: 'row',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  episodeThumbnail: {
    borderRadius: 8,
    marginRight: 12,
  },
  episodeInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  episodeTitle: {
    height: 18,
    borderRadius: 4,
    marginBottom: 8,
    width: '90%',
  },
  episodeSubtitle: {
    height: 14,
    width: '60%',
    borderRadius: 4,
    marginBottom: 12,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    width: '40%',
  },

  // Base skeleton styles
  skeletonText: {
    borderRadius: 4,
  },
});

export default SkeletonCard;
