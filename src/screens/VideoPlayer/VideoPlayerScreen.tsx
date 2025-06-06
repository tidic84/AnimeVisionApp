import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';

import { RootStackScreenProps } from '../../types/navigation';
import { Episode } from '../../types/anime';
import animeSamaService from '../../services/animeSamaService';
import databaseService from '../../services/databaseService';

// Obtenir les dimensions en mode paysage
const getScreenDimensions = () => {
  const { width, height } = Dimensions.get('window');
  return {
    width: Math.max(width, height), // Largeur = la plus grande dimension
    height: Math.min(width, height), // Hauteur = la plus petite dimension
  };
};

type VideoPlayerScreenProps = RootStackScreenProps<'VideoPlayer'>;

const VideoPlayerScreen: React.FC<VideoPlayerScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute<VideoPlayerScreenProps['route']>();
  const { episodeId, animeId, autoPlay = true } = route.params;

  const videoRef = useRef<Video>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [allEpisodes, setAllEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [showControls, setShowControls] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState('1080p');

  // Timer pour masquer les contrôles
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      // Passer en mode paysage
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      
      return () => {
        // Revenir en mode portrait à la sortie
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      };
    }, [])
  );

  useEffect(() => {
    loadEpisodeData();
    
    // Gérer le bouton retour Android
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [episodeId]);

  useEffect(() => {
    if (showControls) {
      resetControlsTimeout();
    }
  }, [showControls]);

  const loadEpisodeData = async () => {
    try {
      setLoading(true);
      console.log(`[VideoPlayer] Chargement de l'épisode ${episodeId} pour l'animé ${animeId}`);
      
      // Charger tous les épisodes de l'animé
      const episodes = await animeSamaService.getAnimeEpisodes(animeId);
      setAllEpisodes(episodes);
      
      // Trouver l'épisode actuel
      const currentEpisode = episodes.find(ep => ep.id === episodeId);
      if (!currentEpisode) {
        console.error(`[VideoPlayer] Épisode ${episodeId} non trouvé dans la liste des épisodes`);
        Alert.alert(
          'Épisode introuvable', 
          'L\'épisode demandé n\'existe pas.',
          [{ text: 'Retour', onPress: () => navigation.goBack() }]
        );
        return;
      }

      setEpisode(currentEpisode);
      
      // Vérifier si des URLs de streaming sont disponibles
      const hasUrls = await animeSamaService.hasStreamingUrls(episodeId);
      if (!hasUrls) {
        console.warn(`[VideoPlayer] Aucune URL de streaming disponible pour ${episodeId}`);
        Alert.alert(
          'Vidéo indisponible', 
          'Aucune source vidéo n\'est disponible pour cet épisode.',
          [{ text: 'Retour', onPress: () => navigation.goBack() }]
        );
        return;
      }

      // Charger les URLs de streaming
      try {
        const streamingUrls = await animeSamaService.getEpisodeStreamingUrls(episodeId);
        
        if (streamingUrls.length === 0) {
          console.warn(`[VideoPlayer] Liste d'URLs vide pour ${episodeId}`);
          Alert.alert(
            'Vidéo indisponible', 
            'Aucune source vidéo n\'est disponible pour cet épisode.',
            [{ text: 'Retour', onPress: () => navigation.goBack() }]
          );
          return;
        }
        
        // Convertir vers le format attendu par Episode
        const convertedUrls = streamingUrls.map(url => ({
          quality: url.quality as any, // Conversion temporaire
          url: url.url,
        }));
        
        setEpisode(prev => prev ? { ...prev, streamingUrls: convertedUrls } : null);
        console.log(`[VideoPlayer] ${convertedUrls.length} URLs de streaming chargées pour ${episodeId}`);
        
      } catch (streamingError) {
        console.error(`[VideoPlayer] Erreur lors du chargement des URLs de streaming:`, streamingError);
        Alert.alert(
          'Erreur de chargement', 
          'Impossible de charger les sources vidéo pour cet épisode.',
          [{ text: 'Retour', onPress: () => navigation.goBack() }]
        );
        return;
      }
      
    } catch (error) {
      console.error('[VideoPlayer] Erreur lors du chargement des données épisode:', error);
      Alert.alert(
        'Erreur de chargement', 
        'Impossible de charger les informations de l\'épisode.',
        [{ text: 'Retour', onPress: () => navigation.goBack() }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackPress = () => {
    navigation.goBack();
    return true;
  };

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    setIsPlaying(!isPlaying);
  };

  const seekTo = async (newPosition: number) => {
    if (!videoRef.current) return;
    await videoRef.current.setPositionAsync(newPosition);
  };

  const skip = async (seconds: number) => {
    const newPosition = Math.max(0, Math.min(duration, position + seconds * 1000));
    await seekTo(newPosition);
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis || 0);
      setDuration(status.durationMillis || 0);
      setBuffering(status.isBuffering || false);
      
      // Sauvegarder la progression
      if (episode && status.positionMillis && status.durationMillis) {
        const progress = (status.positionMillis / status.durationMillis) * 100;
        databaseService.updateEpisodeProgress(episodeId, progress, progress > 90);
        databaseService.updateWatchHistory(animeId, episodeId, progress);
      }
    }
  };

  const playNextEpisode = () => {
    if (!episode || allEpisodes.length === 0) return;
    
    const currentIndex = allEpisodes.findIndex(ep => ep.id === episode.id);
    if (currentIndex < allEpisodes.length - 1) {
      const nextEpisode = allEpisodes[currentIndex + 1];
      navigation.navigate('VideoPlayer', {
        episodeId: nextEpisode.id,
        animeId,
        autoPlay: true,
      });
    } else {
      Alert.alert('Fin de la série', 'Vous avez regardé tous les épisodes disponibles');
    }
  };

  const playPreviousEpisode = () => {
    if (!episode || allEpisodes.length === 0) return;
    
    const currentIndex = allEpisodes.findIndex(ep => ep.id === episode.id);
    if (currentIndex > 0) {
      const previousEpisode = allEpisodes[currentIndex - 1];
      navigation.navigate('VideoPlayer', {
        episodeId: previousEpisode.id,
        animeId,
        autoPlay: true,
      });
    }
  };

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    if (duration === 0) return 0;
    return (position / duration) * 100;
  };

  if (loading || !episode) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement de la vidéo...</Text>
        </View>
      </View>
    );
  }

  // Vérifier si on a des URLs de streaming valides
  if (!episode.streamingUrls || episode.streamingUrls.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={64} color="#f59e0b" />
          <Text style={styles.errorTitle}>Vidéo indisponible</Text>
          <Text style={styles.errorMessage}>
            Aucune source vidéo n'est disponible pour cet épisode.
          </Text>
          <TouchableOpacity 
            style={styles.errorBackButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Utiliser la première URL de streaming disponible
  const videoUrl = episode.streamingUrls[0].url;

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      <TouchableOpacity 
        style={styles.videoContainer}
        onPress={toggleControls}
        activeOpacity={1}
      >
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          style={styles.video}
          shouldPlay={isPlaying}
          resizeMode={ResizeMode.CONTAIN}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={(error) => {
            console.error('Erreur vidéo:', error);
            Alert.alert('Erreur', 'Impossible de lire la vidéo');
          }}
        />

        {/* Indicateur de buffering */}
        {buffering && (
          <View style={styles.bufferingContainer}>
            <Text style={styles.bufferingText}>Chargement...</Text>
          </View>
        )}

        {/* Contrôles de lecture */}
        {showControls && (
          <View style={styles.controlsOverlay}>
            {/* Header avec titre et bouton retour */}
            <View style={styles.topControls}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={handleBackPress}
              >
                <Ionicons name="arrow-back" size={24} color="#ffffff" />
              </TouchableOpacity>
              
              <View style={styles.titleContainer}>
                <Text style={styles.episodeTitle} numberOfLines={1}>
                  {episode.title}
                </Text>
                <Text style={styles.episodeInfo}>
                  Épisode {episode.number}
                </Text>
              </View>
            </View>

            {/* Contrôles centraux */}
            <View style={styles.centerControls}>
              <TouchableOpacity 
                style={styles.controlButton}
                onPress={playPreviousEpisode}
              >
                <Ionicons name="play-skip-back" size={32} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.controlButton}
                onPress={() => skip(-10)}
              >
                <Ionicons name="play-back" size={28} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.controlButton, styles.playButton]}
                onPress={togglePlayPause}
              >
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={40} 
                  color="#ffffff" 
                />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.controlButton}
                onPress={() => skip(10)}
              >
                <Ionicons name="play-forward" size={28} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.controlButton}
                onPress={playNextEpisode}
              >
                <Ionicons name="play-skip-forward" size={32} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Contrôles du bas */}
            <View style={styles.bottomControls}>
              <Text style={styles.timeText}>
                {formatTime(position)}
              </Text>
              
              <View style={styles.progressContainer}>
                <View style={styles.progressBackground}>
                  <View 
                    style={[
                      styles.progressFill,
                      { width: `${getProgressPercentage()}%` }
                    ]}
                  />
                </View>
              </View>
              
              <Text style={styles.timeText}>
                {formatTime(duration)}
              </Text>

              <TouchableOpacity style={styles.qualityButton}>
                <Text style={styles.qualityText}>{selectedQuality}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  bufferingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  bufferingText: {
    color: '#ffffff',
    fontSize: 16,
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  backButton: {
    padding: 10,
    marginRight: 16,
  },
  titleContainer: {
    flex: 1,
  },
  episodeTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  episodeInfo: {
    color: '#cccccc',
    fontSize: 14,
    marginTop: 2,
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  controlButton: {
    padding: 15,
    marginHorizontal: 10,
  },
  playButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 35,
    padding: 20,
    marginHorizontal: 20,
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  timeText: {
    color: '#ffffff',
    fontSize: 14,
    minWidth: 50,
    textAlign: 'center',
  },
  progressContainer: {
    flex: 1,
    marginHorizontal: 15,
  },
  progressBackground: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 2,
  },
  qualityButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 10,
  },
  qualityText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 20,
  },
  errorMessage: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorBackButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default VideoPlayerScreen; 