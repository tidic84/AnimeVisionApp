import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
  StatusBar,
  TouchableWithoutFeedback,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useVideoPlayer, VideoView, VideoSource } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';

import { RootStackScreenProps } from '../../types/navigation';
import { Episode } from '../../types/anime';
import apiService from '../../services/apiService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type VideoPlayerScreenProps = RootStackScreenProps<'VideoPlayer'>;

const VideoPlayerScreen: React.FC<VideoPlayerScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute<VideoPlayerScreenProps['route']>();
  const { episodeId, animeId, autoPlay = false } = route.params;

  // États du player
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [allEpisodes, setAllEpisodes] = useState<Episode[]>([]);
  const [animeTitle, setAnimeTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<string>('idle');

  // Animations
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const skipAnimLeft = useRef(new Animated.Value(0)).current;
  const skipAnimRight = useRef(new Animated.Value(0)).current;
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // États pour multi-tap
  const [lastTap, setLastTap] = useState<number>(0);
  const [tapCount, setTapCount] = useState<number>(0);
  const [tapSide, setTapSide] = useState<'left' | 'right' | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // États pour les animations de skip
  const [skipSeconds, setSkipSeconds] = useState<number>(10);
  const [animatingSkip, setAnimatingSkip] = useState<'left' | 'right' | null>(null);

  // Configuration vidéo
  const videoSource: VideoSource = episode?.streamingUrls?.[0]?.url ? {
    uri: episode.streamingUrls[0].url
  } : null;

  const player = useVideoPlayer(videoSource, (player) => {
    player.timeUpdateEventInterval = 0.5;
    if (autoPlay && videoSource) {
      player.play();
    }
  });

  const duration = player.duration || 0;

  // Navigation entre épisodes
  const currentEpisodeIndex = allEpisodes.findIndex(ep => ep.id === episodeId);
  const hasPreviousEpisode = currentEpisodeIndex > 0;
  const hasNextEpisode = currentEpisodeIndex < allEpisodes.length - 1;
  const previousEpisode = hasPreviousEpisode ? allEpisodes[currentEpisodeIndex - 1] : null;
  const nextEpisode = hasNextEpisode ? allEpisodes[currentEpisodeIndex + 1] : null;

  // Gestion barre de progression simplifiée
  const [progressBarWidth, setProgressBarWidth] = useState(200); // Largeur par défaut

  useEffect(() => {
    loadEpisodeData();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    
    return () => {
      ScreenOrientation.unlockAsync();
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    };
  }, [episodeId, animeId]);

  // Listeners du player
  useEffect(() => {
    if (!player) return;

    const timeUpdateSubscription = player.addListener('timeUpdate', (payload) => {
      setCurrentTime(payload.currentTime);
    });

    const playingChangeSubscription = player.addListener('playingChange', (payload) => {
      setIsPlaying(payload.isPlaying);
    });

    const statusChangeSubscription = player.addListener('statusChange', (payload) => {
      setPlayerStatus(payload.status);
    });

    return () => {
      timeUpdateSubscription.remove();
      playingChangeSubscription.remove();
      statusChangeSubscription.remove();
    };
  }, [player]);

  // Auto-hide contrôles
  useEffect(() => {
    if (showControls) {
      resetControlsTimeout();
    }
  }, [showControls]);

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      hideControls();
    }, 4000);
  };

  const showControlsFunc = () => {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const hideControls = () => {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowControls(false);
    });
  };

  const loadEpisodeData = async () => {
    try {
      setLoading(true);
      console.log(`[VideoPlayer] Chargement de l'épisode ${episodeId} pour l'animé ${animeId}`);
      
      const episodes = await apiService.getAnimeEpisodes(animeId);
      setAllEpisodes(episodes);
      
      const currentEpisode = episodes.find(ep => ep.id === episodeId);
      if (!currentEpisode) {
        Alert.alert(
          'Épisode introuvable', 
          'L\'épisode demandé n\'existe pas.',
          [{ text: 'Retour', onPress: () => navigation.goBack() }]
        );
        return;
      }

      setEpisode(currentEpisode);
      
      // Définir le titre de l'animé
      if (currentEpisode.animeTitle) {
        setAnimeTitle(currentEpisode.animeTitle);
      } else {
        // Si pas de titre dans l'épisode, essayer de le récupérer depuis l'API
        try {
          const animeDetails = await apiService.getAnimeDetails(animeId);
          setAnimeTitle(animeDetails.title || 'Anime');
        } catch (error) {
          console.warn('[VideoPlayer] Impossible de récupérer le titre de l\'animé:', error);
          setAnimeTitle('Anime');
        }
      }

      // Charger les URLs de streaming
      try {
        const streamingUrls = await apiService.getEpisodeStreamingUrls(episodeId);
        if (streamingUrls.length > 0) {
          console.log('[VideoPlayer] URL de streaming sélectionnée:', streamingUrls[0].url);
          setEpisode(prev => prev ? { 
            ...prev, 
            streamingUrls: streamingUrls.map(url => ({
              quality: 'HIGH' as any,
              url: url.url
            }))
          } : null);
        }
      } catch (streamingError) {
        console.warn('[VideoPlayer] Pas d\'URLs de streaming disponibles:', streamingError);
      }

      console.log(`[VideoPlayer] Source vidéo configurée pour ${episodeId}`);
      
    } catch (error) {
      console.error('[VideoPlayer] Erreur lors du chargement des données épisode:', error);
      Alert.alert(
        'Erreur',
        'Impossible de charger l\'épisode. Vérifiez votre connexion.',
        [{ text: 'Retour', onPress: () => navigation.goBack() }]
      );
    } finally {
      setLoading(false);
    }
  };

  // Contrôles de lecture
  const togglePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    showControlsFunc();
  };

  const seekTo = (time: number) => {
    const clampedTime = Math.max(0, Math.min(time, duration));
    player.currentTime = clampedTime;
  };

  const skipForward = (seconds: number = 10) => {
    player.seekBy(seconds);
    showSkipAnimation('right', seconds);
  };

  const skipBackward = (seconds: number = 10) => {
    player.seekBy(-seconds);
    showSkipAnimation('left', seconds);
  };

  const showSkipAnimation = (direction: 'left' | 'right', seconds: number = 10) => {
    setSkipSeconds(seconds);
    setAnimatingSkip(direction);
    
    const anim = direction === 'left' ? skipAnimLeft : skipAnimRight;
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => {
      setAnimatingSkip(null);
    });
  };

  // Navigation entre épisodes
  const goToPreviousEpisode = () => {
    if (previousEpisode) {
      (navigation as any).replace('VideoPlayer', {
        episodeId: previousEpisode.id,
        animeId: animeId,
        autoPlay: true,
      });
    }
  };

  const goToNextEpisode = () => {
    if (nextEpisode) {
      (navigation as any).replace('VideoPlayer', {
        episodeId: nextEpisode.id,
        animeId: animeId,
        autoPlay: true,
      });
    }
  };

  // Gestion barre de progression simplifiée
  const handleProgressPress = (event: any) => {
    const { locationX } = event.nativeEvent;
    const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const newTime = percentage * duration;
    
    console.log(`[Progress SIMPLE] Click à ${locationX}px / ${progressBarWidth}px = ${(percentage * 100).toFixed(1)}%, temps: ${newTime.toFixed(1)}s`);
    seekTo(newTime);
    showControlsFunc();
  };

  // Gestion des gestures avec vraies zones
  const handleScreenPress = (event: any) => {
    const now = Date.now();
    const TAP_DELAY = 400;
    const { locationX, locationY } = event.nativeEvent;
    
    // Utiliser les vraies zones : 40% gauche, 20% centre, 40% droite
    const leftZoneEnd = screenWidth * 0.4;   // 40% de l'écran
    const rightZoneStart = screenWidth * 0.6; // 60% de l'écran
    
    let currentSide: 'left' | 'right' | null = null;
    if (locationX <= leftZoneEnd) {
      currentSide = 'left';
    } else if (locationX >= rightZoneStart) {
      currentSide = 'right';
    } else {
      // Zone centrale (bouton play/pause) - pas de gesture
      console.log(`[Gesture] Tap dans zone centrale (${locationX}px) - ignoré`);
      showControlsFunc();
      return;
    }
    
    console.log(`[Gesture] Tap ${currentSide} à (${locationX}, ${locationY}) - zones: gauche ≤${leftZoneEnd.toFixed(1)}px, droite ≥${rightZoneStart.toFixed(1)}px`);
    
    // Toujours afficher l'overlay
    showControlsFunc();
    
    // Gérer les multi-taps
    if (lastTap && (now - lastTap) < TAP_DELAY && tapSide === currentSide) {
      // Tap consécutif du même côté
      const newTapCount = tapCount + 1;
      setTapCount(newTapCount);
      setLastTap(now);
      
      console.log(`[Gesture] ${currentSide} tap ${newTapCount}`);
      
      // Annuler le timeout précédent
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      
      // Définir un nouveau timeout pour exécuter l'action
      tapTimeoutRef.current = setTimeout(() => {
        const seconds = (newTapCount - 1) * 10; // Double-tap = 10s, triple = 20s, etc.
        if (seconds > 0) {
          console.log(`[Gesture] Exécution ${currentSide} skip ${seconds}s`);
          if (currentSide === 'right') {
            skipForward(seconds);
            setSkipSeconds(seconds);
            showSkipAnimation('right', seconds);
          } else {
            skipBackward(seconds);
            setSkipSeconds(seconds);
            showSkipAnimation('left', seconds);
          }
        }
        // Reset
        setTapCount(0);
        setTapSide(null);
        setLastTap(0);
      }, TAP_DELAY);
      
    } else {
      // Premier tap ou tap d'un côté différent
      setTapCount(1);
      setTapSide(currentSide);
      setLastTap(now);
      
      console.log(`[Gesture] Premier tap ${currentSide}`);
      
      // Annuler le timeout précédent
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      
      // Timeout pour exécuter l'action si pas d'autres taps
      tapTimeoutRef.current = setTimeout(() => {
        // Simple tap - basculer les contrôles
        console.log(`[Gesture] Simple tap ${currentSide} - toggle controls`);
        if (showControls) {
          hideControls();
        }
        // Reset
        setTapCount(0);
        setTapSide(null);
        setLastTap(0);
      }, TAP_DELAY);
    }
  };

  // Formatage temps
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || !episode) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="white" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (playerStatus === 'error') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Erreur de lecture vidéo</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.retryButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Vidéo en plein écran absolu */}
      {videoSource && (
        <VideoView
          style={styles.videoFullScreen}
          player={player}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          contentFit="contain"
          nativeControls={false}
        />
      )}

      {/* Overlay sombre global */}
      <Animated.View style={[styles.globalOverlay, { opacity: controlsOpacity }]} />

      {/* Animations de skip */}
      <Animated.View style={[styles.skipIndicatorLeft, { opacity: skipAnimLeft }]}>
        <Ionicons name="play-back" size={40} color="white" />
        <Text style={styles.skipText}>{animatingSkip === 'left' ? `-${skipSeconds}s` : '-10s'}</Text>
      </Animated.View>
      
      <Animated.View style={[styles.skipIndicatorRight, { opacity: skipAnimRight }]}>
        <Ionicons name="play-forward" size={40} color="white" />
        <Text style={styles.skipText}>{animatingSkip === 'right' ? `+${skipSeconds}s` : '+10s'}</Text>
      </Animated.View>

      {/* Contrôles overlay */}
      <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>

        {/* Header avec gradient */}
        <View style={styles.topSection}>
          <View style={styles.headerContent}>
            <View style={styles.titleSection}>
              <Text style={styles.animeTitle} numberOfLines={1}>
                {animeTitle || episode.animeTitle || 'Anime'}
              </Text>
              <Text style={styles.episodeTitle} numberOfLines={1}>
                E{episode.number} - {episode.title}
              </Text>
            </View>
            
            <View style={styles.controlsSection}>
              <TouchableOpacity
                style={[styles.headerButton, !hasPreviousEpisode && styles.disabledButton]}
                onPress={goToPreviousEpisode}
                disabled={!hasPreviousEpisode}
              >
                <Ionicons name="play-skip-back" size={24} color={hasPreviousEpisode ? "white" : "#666"} />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.headerButton, !hasNextEpisode && styles.disabledButton]}
                onPress={goToNextEpisode}
                disabled={!hasNextEpisode}
              >
                <Ionicons name="play-skip-forward" size={24} color={hasNextEpisode ? "white" : "#666"} />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="tv-outline" size={24} color="white" />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="settings" size={24} color="white" />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Zone centrale avec bouton play/pause et zones de gesture */}
        <View style={styles.centerSection}>
          {/* Zone de tap gauche pour skip arrière - TOUJOURS reculer */}
          <TouchableWithoutFeedback onPress={(event) => {
            console.log('[Gesture] Tap dans zone ROUGE - toujours reculer');
            const now = Date.now();
            const TAP_DELAY = 400;
            const currentSide = 'left'; // Force toujours left pour la zone rouge
            
            showControlsFunc();
            
            if (lastTap && (now - lastTap) < TAP_DELAY && tapSide === currentSide) {
              const newTapCount = tapCount + 1;
              setTapCount(newTapCount);
              setLastTap(now);
              
              if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
              
              tapTimeoutRef.current = setTimeout(() => {
                const seconds = (newTapCount - 1) * 10;
                if (seconds > 0) {
                  console.log(`[Gesture RED] Skip arrière ${seconds}s`);
                  skipBackward(seconds);
                  setSkipSeconds(seconds);
                  showSkipAnimation('left', seconds);
                }
                setTapCount(0);
                setTapSide(null);
                setLastTap(0);
              }, TAP_DELAY);
            } else {
              setTapCount(1);
              setTapSide(currentSide);
              setLastTap(now);
              
              if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
              
              tapTimeoutRef.current = setTimeout(() => {
                if (showControls) hideControls();
                setTapCount(0);
                setTapSide(null);
                setLastTap(0);
              }, TAP_DELAY);
            }
          }}>
            <View style={styles.leftTapZone} />
          </TouchableWithoutFeedback>
          
          {/* Bouton play/pause central */}
          <TouchableOpacity onPress={togglePlayPause} style={styles.playPauseButton}>
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={50} 
              color="white" 
            />
          </TouchableOpacity>
          
          {/* Zone de tap droite pour skip avant - TOUJOURS avancer */}
          <TouchableWithoutFeedback onPress={(event) => {
            console.log('[Gesture] Tap dans zone VERTE - toujours avancer');
            const now = Date.now();
            const TAP_DELAY = 400;
            const currentSide = 'right'; // Force toujours right pour la zone verte
            
            showControlsFunc();
            
            if (lastTap && (now - lastTap) < TAP_DELAY && tapSide === currentSide) {
              const newTapCount = tapCount + 1;
              setTapCount(newTapCount);
              setLastTap(now);
              
              if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
              
              tapTimeoutRef.current = setTimeout(() => {
                const seconds = (newTapCount - 1) * 10;
                if (seconds > 0) {
                  console.log(`[Gesture GREEN] Skip avant ${seconds}s`);
                  skipForward(seconds);
                  setSkipSeconds(seconds);
                  showSkipAnimation('right', seconds);
                }
                setTapCount(0);
                setTapSide(null);
                setLastTap(0);
              }, TAP_DELAY);
            } else {
              setTapCount(1);
              setTapSide(currentSide);
              setLastTap(now);
              
              if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
              
              tapTimeoutRef.current = setTimeout(() => {
                if (showControls) hideControls();
                setTapCount(0);
                setTapSide(null);
                setLastTap(0);
              }, TAP_DELAY);
            }
          }}>
            <View style={styles.rightTapZone} />
          </TouchableWithoutFeedback>
        </View>

        {/* Contrôles du bas avec gradient */}
        <View style={styles.bottomSection}>
          <View style={styles.progressSection}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            
            <TouchableWithoutFeedback onPress={handleProgressPress}>
              <View 
                style={styles.progressTrack}
                onLayout={(event) => {
                  const { width } = event.nativeEvent.layout;
                  setProgressBarWidth(width);
                  console.log(`[Progress] Largeur mesurée: ${width}px`);
                }}
              >
                <View style={styles.progressBackground}>
                  <View 
                    style={[
                      styles.progressForeground, 
                      { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }
                    ]} 
                  />
                  {/* Indicateur de position pour améliorer la précision */}
                  <View 
                    style={[
                      styles.progressThumb,
                      { 
                        left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                        transform: [{ translateX: -6 }] // Centrer le thumb
                      }
                    ]}
                  />
                </View>
              </View>
            </TouchableWithoutFeedback>
            
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>
      </Animated.View>

      {/* Zone de fallback pour afficher les contrôles quand ils sont cachés */}
      <TouchableWithoutFeedback onPress={() => showControlsFunc()}>
        <View style={[styles.fallbackGestureArea, { opacity: showControls ? 0 : 1 }]} />
      </TouchableWithoutFeedback>

      {/* Indicateur de buffering */}
      {playerStatus === 'loading' && (
        <View style={styles.bufferingContainer}>
          <ActivityIndicator size="large" color="white" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  videoFullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 1,
  },

  globalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.1)',
    zIndex: 3,
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,  // Au-dessus de la vidéo
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  topSection: {
    paddingTop: 30,
    paddingHorizontal: 20,
    paddingBottom: 30,
    pointerEvents: 'box-none',
  },
  bottomSection: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 20,
    pointerEvents: 'box-none',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    pointerEvents: 'box-none',
  },
  titleSection: {
    flex: 1,
    marginRight: 20,
    pointerEvents: 'box-none',
  },
  controlsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  animeTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  episodeTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '400',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    pointerEvents: 'auto',
    zIndex: 10, // S'assurer que les boutons sont au-dessus de tout
  },
  disabledButton: {
    opacity: 0.4,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'box-none',
    position: 'relative',
  },
  playPauseButton: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'auto',
    zIndex: 10, // S'assurer que le bouton play/pause reste cliquable
    backgroundColor: 'rgba(255, 255, 0, 0.3)', // Jaune semi-transparent pour debug
    borderRadius: 40, // Rendre la zone circulaire pour mieux voir
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  timeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    minWidth: 50,
    textAlign: 'center',
  },
  progressTrack: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 15, // Zone de toucher plus large
    pointerEvents: 'auto',
    zIndex: 10, // S'assurer que la barre de progression reste interactive
  },
  progressBackground: {
    height: 6, // Barre plus épaisse
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    overflow: 'visible', // Permettre au thumb de dépasser
    position: 'relative',
  },
  progressForeground: {
    height: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 3,
  },
  progressThumb: {
    position: 'absolute',
    top: -3, // Centrer verticalement
    width: 12,
    height: 12,
    backgroundColor: '#FF6B35',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  skipIndicatorLeft: {
    position: 'absolute',
    left: 80,
    top: '50%',
    transform: [{ translateY: -40 }],
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    zIndex: 8, // Au-dessus des contrôles mais sous les gestures
  },
  skipIndicatorRight: {
    position: 'absolute',
    right: 80,
    top: '50%',
    transform: [{ translateY: -40 }],
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    zIndex: 8, // Au-dessus des contrôles mais sous les gestures
  },
  skipText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  errorText: {
    color: 'white',
    fontSize: 18,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
  },
  bufferingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 9, // Au-dessus de tout pour toujours être visible
    pointerEvents: 'none', // Ne pas bloquer les interactions
  },
  leftTapZone: {
    position: 'absolute',
    top: 0, // Plein écran
    left: 0,
    width: '47.5%', // Zone gauche agrandie (au lieu de 40%)
    bottom: 0, // Plein écran
    pointerEvents: 'auto',
    backgroundColor: 'rgba(255, 0, 0, 0.3)', // Rouge semi-transparent pour debug
  },
  rightTapZone: {
    position: 'absolute',
    top: 0, // Plein écran
    right: 0,
    width: '47.5%', // Zone droite agrandie (au lieu de 40%)
    bottom: 0, // Plein écran
    pointerEvents: 'auto',
    backgroundColor: 'rgba(0, 255, 0, 0.3)', // Vert semi-transparent pour debug
  },
  fallbackGestureArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4, // Sous l'overlay des contrôles
    pointerEvents: 'auto',
    backgroundColor: 'rgba(0, 0, 255, 0.2)', // Bleu semi-transparent pour debug
  },
});

export default VideoPlayerScreen; 