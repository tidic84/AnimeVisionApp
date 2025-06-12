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
import { PanGestureHandler, State } from 'react-native-gesture-handler';

import { RootStackScreenProps } from '../../types/navigation';
import { Episode } from '../../types/anime';
import apiService from '../../services/apiService';
import videoUrlExtractor from '../../services/VideoUrlExtractor';
import VideoOptionsModal, { VideoQuality } from '../../components/VideoOptionsModal';

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
  const [extractingHLS, setExtractingHLS] = useState(false);
  const [forceClientExtraction, setForceClientExtraction] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<string>('idle');

  // Debug: Log des états de loading
  console.log('[VideoPlayer] États actuels:', { loading, extractingHLS, episodeId, episode: !!episode });

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

  // États pour les options vidéo (moved up before useVideoPlayer)
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(autoPlay);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentQuality, setCurrentQuality] = useState('auto');
  const [availableQualities, setAvailableQualities] = useState<VideoQuality[]>([
    { label: 'Auto', value: 'auto', url: '' }
  ]);

  // Configuration vidéo - Simplifiée pour éviter les problèmes de headers
  const videoSource: VideoSource | null = episode?.streamingUrls?.[0]?.url ? {
    uri: episode.streamingUrls[0].url
    // Headers supprimés car pourraient causer des problèmes avec Expo Video et HLS
  } : null;

  console.log('[VideoPlayer] VideoSource:', videoSource?.uri || 'null');

  // Créer le player TOUJOURS (même sans source) pour éviter l'erreur de hooks
  const player = useVideoPlayer(videoSource || { uri: '' }, (player) => {
    if (player && videoSource) {
      console.log('[VideoPlayer] Configuration du player...');
      player.timeUpdateEventInterval = 0.5;
      player.playbackRate = playbackSpeed;
      if (autoPlay) {
        console.log('[VideoPlayer] Auto-play activé pour:', videoSource.uri);
        player.play();
      }
    }
  });

  const duration = player?.duration || 0;

  // Navigation entre épisodes
  const currentEpisodeIndex = allEpisodes.findIndex(ep => ep.id === episodeId);
  const hasPreviousEpisode = currentEpisodeIndex > 0;
  const hasNextEpisode = currentEpisodeIndex < allEpisodes.length - 1;
  const previousEpisode = hasPreviousEpisode ? allEpisodes[currentEpisodeIndex - 1] : null;
  const nextEpisode = hasNextEpisode ? allEpisodes[currentEpisodeIndex + 1] : null;

  // Gestion barre de progression simplifiée
  const [progressBarWidth, setProgressBarWidth] = useState(200); // Largeur par défaut
  const [seekingToPosition, setSeekingToPosition] = useState<number | null>(null); // Position cible après clic
  
  // États pour le drag fluide
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0); // Position pendant le drag (0-1)
  const progressBarRef = useRef<View>(null);
  const [useFallbackDrag, setUseFallbackDrag] = useState(false); // Fallback si PanGestureHandler échoue
  
  // États pour la preview de drag
  const [dragPreviewVisible, setDragPreviewVisible] = useState(false);
  const [dragPreviewPosition, setDragPreviewPosition] = useState({ x: 0, y: 0 });
  const [dragPreviewTime, setDragPreviewTime] = useState(0);

  useEffect(() => {
    loadEpisodeData();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    
    // Timeout de sécurité pour éviter le loading infini
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.warn('[VideoPlayer] ⚠️ Timeout de loading détecté, arrêt forcé');
        setLoading(false);
        setExtractingHLS(false);
        Alert.alert(
          'Timeout',
          'Le chargement prend trop de temps. Veuillez réessayer.',
          [{ text: 'Retour', onPress: () => navigation.goBack() }]
        );
      }
    }, 30000); // 30 secondes maximum
    
    return () => {
      ScreenOrientation.unlockAsync();
      clearTimeout(loadingTimeout);
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
    if (!player) {
      console.log('[VideoPlayer] ⚠️ Pas de player, pas de listeners');
      return;
    }

    console.log('[VideoPlayer] 🎧 Configuration des listeners du player...');

    const timeUpdateSubscription = player.addListener('timeUpdate', (payload: any) => {
      setCurrentTime(payload.currentTime);
    });

    const playingChangeSubscription = player.addListener('playingChange', (payload: any) => {
      setIsPlaying(payload.isPlaying);
    });

    const statusChangeSubscription = player.addListener('statusChange', (payload: any) => {
      console.log('[VideoPlayer] Status change:', payload.status);
      setPlayerStatus(payload.status);
      
      if (payload.status === 'error') {
        console.log('[VideoPlayer] ❌ Erreur du lecteur vidéo détectée');
        if (payload.error) {
          console.log('[VideoPlayer] ❌ Détails erreur:', payload.error);
        }
      }
    });

    // Ajouter d'autres listeners pour diagnostiquer
    const sourceChangeSubscription = player.addListener('sourceChange', (payload: any) => {
      const sourceUri = typeof payload.source === 'object' && payload.source ? payload.source.uri : payload.source;
      console.log('[VideoPlayer] 📺 Source change:', sourceUri);
    });

    return () => {
      timeUpdateSubscription.remove();
      playingChangeSubscription.remove();
      statusChangeSubscription.remove();
      sourceChangeSubscription.remove();
    };
  }, [player]);

  // Appliquer la vitesse de lecture quand elle change
  useEffect(() => {
    if (player) {
      player.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, player]);

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
      console.log('[VideoPlayer] 🚀 DÉBUT loadEpisodeData - loading =', loading);
      setLoading(true);
      console.log('[VideoPlayer] Chargement de l\'épisode', episodeId, 'pour l\'animé', animeId);
      
      const episodes = await apiService.getAnimeEpisodes(animeId);
      console.log('[VideoPlayer] ✅ Episodes récupérés:', episodes.length);
      setAllEpisodes(episodes);
      
      const currentEpisode = episodes.find(ep => ep.id === episodeId);
      if (!currentEpisode) {
        console.log('[VideoPlayer] ❌ Episode introuvable');
        Alert.alert(
          'Épisode introuvable', 
          'L\'épisode demandé n\'existe pas.',
          [{ text: 'Retour', onPress: () => navigation.goBack() }]
        );
        return;
      }

      console.log('[VideoPlayer] ✅ Episode trouvé:', currentEpisode.title);
      setEpisode(currentEpisode);
      
      // Définir le titre de l'animé
      if (currentEpisode.animeTitle) {
        setAnimeTitle(currentEpisode.animeTitle);
        console.log('[VideoPlayer] ✅ Titre animé:', currentEpisode.animeTitle);
      } else {
        // Si pas de titre dans l'épisode, essayer de le récupérer depuis l'API
        try {
          const animeDetails = await apiService.getAnimeDetails(animeId);
          setAnimeTitle(animeDetails.title || 'Anime');
          console.log('[VideoPlayer] ✅ Titre animé depuis API:', animeDetails.title);
        } catch (error) {
          console.warn('[VideoPlayer] Impossible de récupérer le titre de l\'animé:', error);
          setAnimeTitle('Anime');
        }
      }

      // Charger les URLs de streaming - extraction HLS côté client uniquement
      try {
        console.log('[VideoPlayer] 🎬 DÉBUT Extraction HLS côté client...');
        setExtractingHLS(true);
        
        const extractionResult = await videoUrlExtractor.extractHLSForEpisode(episodeId);
        
        if (extractionResult.success && extractionResult.urls.length > 0) {
          console.log(`[VideoPlayer] ✅ HLS extrait en ${extractionResult.extractionTime}ms`);
          console.log('[VideoPlayer] URL HLS:', extractionResult.urls[0].url);
          
          setEpisode(prev => prev ? { 
            ...prev, 
            streamingUrls: extractionResult.urls.map(url => ({
              quality: 'HIGH' as any,
              url: url.url
            }))
          } : null);
          console.log('[VideoPlayer] ✅ URLs de streaming configurées');
        } else {
          // Pas de fallback - afficher l'erreur directement
          console.error('[VideoPlayer] ❌ Échec extraction HLS:', extractionResult.error);
          Alert.alert(
            'Erreur de lecture',
            `Impossible d'extraire le lien vidéo:\n${extractionResult.error}`,
            [{ text: 'Retour', onPress: () => navigation.goBack() }]
          );
        }
      } catch (streamingError) {
        console.error('[VideoPlayer] ❌ Erreur extraction HLS:', streamingError);
        Alert.alert(
          'Erreur de lecture',
          'Impossible d\'extraire le lien vidéo. Vérifiez votre connexion.',
          [{ text: 'Retour', onPress: () => navigation.goBack() }]
        );
      } finally {
        console.log('[VideoPlayer] 🏁 FIN extraction HLS');
        setExtractingHLS(false);
      }

      console.log(`[VideoPlayer] ✅ Source vidéo configurée pour ${episodeId}`);
      
    } catch (error) {
      console.error('[VideoPlayer] ❌ Erreur lors du chargement des données épisode:', error);
      Alert.alert(
        'Erreur',
        'Impossible de charger l\'épisode. Vérifiez votre connexion.',
        [{ text: 'Retour', onPress: () => navigation.goBack() }]
      );
    } finally {
      console.log('[VideoPlayer] 🏁 FIN loadEpisodeData - setLoading(false)');
      setLoading(false);
    }
  };

  // Contrôles de lecture
  const togglePlayPause = () => {
    if (!player) {
      console.log('[VideoPlayer] ⚠️ Pas de player pour togglePlayPause');
      return;
    }
    
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    showControlsFunc();
  };

  const seekTo = (time: number) => {
    if (!player) {
      console.log('[VideoPlayer] ⚠️ Pas de player pour seekTo');
      return;
    }
    
    const clampedTime = Math.max(0, Math.min(time, duration));
    player.currentTime = clampedTime;
  };

  const skipForward = (seconds: number = 10) => {
    if (!player) {
      console.log('[VideoPlayer] ⚠️ Pas de player pour skipForward');
      return;
    }
    
    player.seekBy(seconds);
    showSkipAnimation('right', seconds);
  };

  const skipBackward = (seconds: number = 10) => {
    if (!player) {
      console.log('[VideoPlayer] ⚠️ Pas de player pour skipBackward');
      return;
    }
    
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
    // Éviter les conflits avec le drag
    if (isDragging) return;
    
    const { locationX } = event.nativeEvent;
    const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const newTime = percentage * duration;
    
    // Approche simple pour éviter les bugs de drag
    setSeekingToPosition(newTime);
    seekTo(newTime);
    showControlsFunc();
    console.log(`[Progress CLICK] Click à ${locationX}px / ${progressBarWidth}px = ${(percentage * 100).toFixed(1)}%, temps: ${newTime.toFixed(1)}s`);
  };

  // Gestion des gestures avec vraies zones
  const handleScreenPress = (event: any) => {
    const now = Date.now();
    const TAP_DELAY = 250; // Délai raisonnable pour le double-tap
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    
    console.log(`[Gesture DEBUG] event.nativeEvent:`, {
      locationX, locationY, pageX, pageY, 
      screenWidth, screenHeight,
      target: event.nativeEvent.target
    });
    
    // Utiliser les vraies zones : 47.5% gauche, 5% centre, 47.5% droite
    const leftZoneEnd = screenWidth * 0.475;   // 47.5% de l'écran
    const rightZoneStart = screenWidth * 0.525; // 52.5% de l'écran
    
    // Utiliser pageX (coordonnées absolues) au lieu de locationX (relatives)
    const absoluteX = pageX || locationX;
    
    let currentSide: 'left' | 'right' | null = null;
    if (absoluteX <= leftZoneEnd) {
      currentSide = 'left';
    } else if (absoluteX >= rightZoneStart) {
      currentSide = 'right';
    } else {
      // Zone centrale (bouton play/pause) - pas de gesture
      console.log(`[Gesture] Tap dans zone centrale (${absoluteX}px) - ignoré`);
      showControlsFunc();
      return;
    }
    
    console.log(`[Gesture] Tap ${currentSide} à abs(${absoluteX}, ${locationY}) page(${pageX}, ${pageY}) - zones: gauche ≤${leftZoneEnd.toFixed(1)}px, droite ≥${rightZoneStart.toFixed(1)}px`);
    
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
            console.log(`[Gesture] → FORWARD ${seconds}s`);
            skipForward(seconds);
            setSkipSeconds(seconds);
            showSkipAnimation('right', seconds);
          } else {
            console.log(`[Gesture] → BACKWARD ${seconds}s`);
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

  // Gestionnaire de drag fluide pour la barre de progression
  const handleProgressGesture = (event: any) => {
    const { state, x, absoluteX, absoluteY } = event.nativeEvent;
    
    switch (state) {
      case State.BEGAN:
        setIsDragging(true);
        setDragPreviewVisible(true);
        showControlsFunc();
        
        // Calculer la position initiale
        const initialPercentage = Math.max(0, Math.min(1, x / progressBarWidth));
        const initialTime = initialPercentage * duration;
        setDragPosition(initialPercentage);
        setDragPreviewTime(initialTime);
        
        // Positionner la preview au-dessus du doigt
        setDragPreviewPosition({ 
          x: absoluteX, 
          y: absoluteY - 80 // 80px au-dessus du doigt
        });
        
        console.log(`[Progress DRAG] Began à ${(initialPercentage * 100).toFixed(1)}%`);
        break;
        
      case State.ACTIVE:
        // Mettre à jour la position pendant le drag
        const percentage = Math.max(0, Math.min(1, x / progressBarWidth));
        const previewTime = percentage * duration;
        setDragPosition(percentage);
        setDragPreviewTime(previewTime);
        
        // Mettre à jour la position de la preview
        setDragPreviewPosition({ 
          x: absoluteX, 
          y: absoluteY - 80 
        });
        
        showControlsFunc();
        console.log(`[Progress DRAG] Active à ${(percentage * 100).toFixed(1)}% - ${formatTime(previewTime)}`);
        break;
        
      case State.END:
      case State.CANCELLED:
        // Appliquer la position finale
        const finalPercentage = Math.max(0, Math.min(1, x / progressBarWidth));
        const newTime = finalPercentage * duration;
        
        setIsDragging(false);
        setDragPreviewVisible(false);
        setSeekingToPosition(newTime);
        seekTo(newTime);
        showControlsFunc();
        console.log(`[Progress DRAG] End à ${(finalPercentage * 100).toFixed(1)}%, appliqué: ${newTime.toFixed(1)}s`);
        break;
    }
  };

  // Version fallback avec responders natifs
  const handleProgressDragStart = (event: any) => {
    setIsDragging(true);
    const { locationX } = event.nativeEvent;
    const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
    setDragPosition(percentage);
    showControlsFunc();
    console.log(`[Progress DRAG FALLBACK] Start à ${(percentage * 100).toFixed(1)}%`);
  };

  const handleProgressDragMove = (event: any) => {
    if (!isDragging) return;
    const { locationX } = event.nativeEvent;
    const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
    setDragPosition(percentage);
    showControlsFunc();
  };

  const handleProgressDragEnd = (event: any) => {
    if (!isDragging) return;
    const { locationX } = event.nativeEvent;
    const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const newTime = percentage * duration;
    
    setIsDragging(false);
    setDragPreviewVisible(false);
    setSeekingToPosition(newTime);
    seekTo(newTime);
    showControlsFunc();
    console.log(`[Progress DRAG FALLBACK] End à ${(percentage * 100).toFixed(1)}%, appliqué: ${newTime.toFixed(1)}s`);
  };

  // Formatage temps
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Vérifier si la vidéo a fini de chercher à la position cible
    if (seekingToPosition !== null && Math.abs(currentTime - seekingToPosition) < 0.5) {
      setSeekingToPosition(null);
      console.log(`[Progress SYNC] Position synchronisée: ${currentTime.toFixed(1)}s`);
    }
  }, [currentTime, seekingToPosition]);

  // Gestionnaires pour les zones de gesture (versions simplifiées)
  const handleLeftTap = () => {
    console.log('[Gesture RED] Rewind zone activated');
    skipBackward(10);
  };

  const handleRightTap = () => {
    console.log('[Gesture GREEN] Forward zone activated');
    skipForward(10);
  };

  // Gestion du fullscreen
  const [isFullscreen, setIsFullscreen] = useState(true); // Par défaut en fullscreen dans le player
  
  const toggleFullscreen = () => {
    console.log('[Fullscreen] Toggle (placeholder)');
    setIsFullscreen(!isFullscreen);
    // Note: La vraie implémentation du fullscreen dépend de votre setup d'orientation
  };

  // Debug: log de rendu
  console.log('[VideoPlayer] RENDU - Conditions:', { 
    loading, 
    extractingHLS,
    episode: !!episode, 
    shouldShowLoading: loading || !episode || extractingHLS,
    hasVideoSource: !!videoSource
  });

  // Afficher le chargement si loading OU extractingHLS OU pas d'épisode
  if (loading || !episode || extractingHLS) {
    console.log('[VideoPlayer] 🔄 AFFICHAGE DU LOADING...');
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        
        {/* Spinner simple sans messages */}
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </View>
    );
  }

  // Vérifier si on a un épisode mais pas de source vidéo (erreur d'extraction)
  if (episode && !videoSource && !loading && !extractingHLS) {
    console.log('[VideoPlayer] 💥 AFFICHAGE ERREUR - Pas de source vidéo');
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        
        {/* Interface d'erreur de streaming */}
        <View style={styles.errorOverlay}>
          <View style={styles.errorContent}>
            <Ionicons name="videocam-off" size={80} color="#FF6B35" />
            <Text style={styles.errorTitle}>Vidéo Non Disponible</Text>
            <Text style={styles.errorMessage}>
              Aucun serveur de streaming trouvé pour cet épisode.
            </Text>
            <Text style={styles.errorSubtitle}>
              Épisode {episode.number}: {episode.title}
            </Text>
            
            <View style={styles.errorActions}>
              <TouchableOpacity 
                style={styles.errorButton}
                onPress={() => {
                  console.log('[VideoPlayer] Retry extraction...');
                  setLoading(true);
                  loadEpisodeData();
                }}
              >
                <Ionicons name="refresh" size={20} color="white" />
                <Text style={styles.errorButtonText}>Réessayer</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.errorButton, styles.diagnosticButton]}
                onPress={async () => {
                  console.log('[VideoPlayer] Running diagnostics...');
                  try {
                    const baseUrl = 'http://localhost:8000'; // ou votre API_ADDRESS
                    const response = await fetch(`${baseUrl}/api/v1/mobile/episode/${episodeId}/streaming/embeds`);
                    const data = await response.json();
                    
                    if (data.success && data.servers) {
                      Alert.alert(
                        'Diagnostic',
                        `Serveurs trouvés: ${data.servers.length}\n` +
                        `Types: ${data.servers.map((s: any) => s.server_type).join(', ')}\n` +
                        `Avec embeds: ${data.servers.filter((s: any) => s.embed_url).length}\n` +
                        `Meilleur serveur: ${data.best_server?.server_type || 'N/A'}`,
                      );
                    } else {
                      Alert.alert('Diagnostic', 'Aucun serveur disponible dans l\'API');
                    }
                  } catch (error) {
                    Alert.alert('Diagnostic', `Erreur API: ${error}`);
                  }
                }}
              >
                <Ionicons name="bug" size={20} color="white" />
                <Text style={styles.errorButtonText}>Diagnostic</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.errorButton, styles.secondaryErrorButton]}
                onPress={() => {
                  console.log('[Exit] Retour à l\'écran précédent');
                  navigation.goBack();
                }}
              >
                <Ionicons name="arrow-back" size={20} color="#FF6B35" />
                <Text style={[styles.errorButtonText, styles.secondaryErrorButtonText]}>Retour</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  console.log('[VideoPlayer] 🎬 AFFICHAGE DU PLAYER...');

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
    <TouchableWithoutFeedback onPress={handleScreenPress}>
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

        {/* Overlay des contrôles */}
        {showControls && (
          <Animated.View 
            style={[
              styles.controlsOverlay,
              { opacity: controlsOpacity }
            ]}
          >
            {/* Header avec titre et navigation épisodes */}
            <View style={styles.topSection}>
              <View style={styles.headerContent}>
                <View style={styles.titleSection}>
                  <Text style={styles.animeTitle}>{animeTitle || "Chargement..."}</Text>
                  <Text style={styles.episodeTitle}>
                    Épisode {episode?.number || "?"}{episode?.title && ` - ${episode.title}`}
                </Text>
            </View>

                <View style={styles.controlsSection}>
              <TouchableOpacity 
                    style={[styles.headerButton, previousEpisode ? {} : styles.disabledButton]}
                    onPress={goToPreviousEpisode}
                    disabled={!previousEpisode}
              >
                    <Ionicons name="play-skip-back" size={24} color="white" />
              </TouchableOpacity>

              <TouchableOpacity 
                    style={[styles.headerButton, nextEpisode ? {} : styles.disabledButton]}
                    onPress={goToNextEpisode}
                    disabled={!nextEpisode}
                  >
                    <Ionicons name="play-skip-forward" size={24} color="white" />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.headerButton}
                    onPress={() => setOptionsVisible(true)}
                  >
                    <Ionicons name="settings" size={24} color="white" />
              </TouchableOpacity>

              <TouchableOpacity 
                    style={styles.headerButton}
                    onPress={() => {
                      console.log('[Exit] Retour à l\'écran précédent');
                      navigation.goBack();
                    }}
                  >
                    <Ionicons name="close" size={24} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

                      {/* Zone centrale avec boutons */}
          <View style={styles.fallbackGestureArea}>
            {playerStatus === 'loading' || extractingHLS ? (
              <View style={styles.playPauseButton}>
                <ActivityIndicator size="large" color="white" />
                {extractingHLS && (
                  <Text style={styles.extractingText}>Extraction HLS...</Text>
                )}
              </View>
            ) : (
              <TouchableOpacity 
                style={styles.playPauseButton}
                onPress={togglePlayPause}
              >
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={40} 
                  color="white" 
                />
              </TouchableOpacity>
            )}
          </View>

            {/* Section du bas avec barre de progression moderne */}
            <View style={styles.bottomSection}>
              <View style={styles.progressSection}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                
                <TouchableWithoutFeedback onPress={handleProgressPress}>
                  <PanGestureHandler 
                    onGestureEvent={handleProgressGesture}
                    onHandlerStateChange={handleProgressGesture}
                  >
                    <View 
                      ref={progressBarRef}
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
                            { 
                              width: `${
                                isDragging
                                  ? dragPosition * 100
                                  : seekingToPosition !== null
                                  ? duration > 0 ? (seekingToPosition / duration) * 100 : 0
                                  : duration > 0 ? (currentTime / duration) * 100 : 0
                              }%` 
                            }
                          ]} 
                        />
                        {/* Indicateur de position pour améliorer la précision */}
                        <View 
                          style={[
                            styles.progressThumb,
                            { 
                              left: `${
                                isDragging
                                  ? dragPosition * 100
                                  : seekingToPosition !== null
                                  ? duration > 0 ? (seekingToPosition / duration) * 100 : 0
                                  : duration > 0 ? (currentTime / duration) * 100 : 0
                              }%`,
                              backgroundColor: (isDragging || seekingToPosition !== null) ? '#FF8C5A' : '#FF6B35',
                              transform: [{ translateX: -8 }, { scale: (isDragging || seekingToPosition !== null) ? 1.3 : 1 }],
                            }
                    ]}
                  />
                </View>
                    </View>
                  </PanGestureHandler>
                </TouchableWithoutFeedback>
                
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            </View>
          </Animated.View>
          )}

          {/* Preview de drag temporelle */}
          {dragPreviewVisible && (
            <View 
              style={[
                styles.dragPreview,
                {
                  left: dragPreviewPosition.x - 30, // Centrer la bulle (largeur ~60px)
                  bottom: 100, // Position fixe près de la barre de progression
                }
              ]}
            >
              <Text style={styles.dragPreviewText}>
                {formatTime(dragPreviewTime)}
              </Text>
          </View>
        )}
    </View>
    </TouchableWithoutFeedback>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    width: '100%', // Forcer la largeur complète
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
    borderRadius: 40, // Rendre la zone circulaire pour mieux voir
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'box-none',
    width: '100%', // Forcer la largeur complète
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
    minWidth: 100, // Largeur minimale pour garantir l'affichage
    width: '100%', // Forcer la largeur complète
  },
  progressBackground: {
    height: 8, // Barre plus épaisse pour être visible
    backgroundColor: 'rgba(255,255,255,0.4)', // Plus opaque pour être visible
    borderRadius: 4,
    overflow: 'visible', // Permettre au thumb de dépasser
    position: 'relative',
    width: '100%', // Largeur complète explicite
    minWidth: 100, // Largeur minimale garantie
  },
  progressForeground: {
    height: 8, // Même hauteur que le background
    backgroundColor: '#FF6B35',
    borderRadius: 4,
    minWidth: 2, // Largeur minimale pour être visible même à 0%
  },
  progressThumb: {
    position: 'absolute',
    top: -4, // Centrer verticalement (hauteur 8px + 2*4px = 16px)
    width: 16, // Plus gros pour être visible
    height: 16,
    backgroundColor: '#FF6B35',
    borderRadius: 8,
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
  leftTapZone: {
    position: 'absolute',
    top: 0, // Plein écran
    left: 0,
    width: '47.5%', // Zone gauche agrandie (au lieu de 40%)
    bottom: 0, // Plein écran
    pointerEvents: 'auto',
  },
  rightTapZone: {
    position: 'absolute',
    top: 0, // Plein écran
    right: 0,
    width: '47.5%', // Zone droite agrandie (au lieu de 40%)
    bottom: 0, // Plein écran
    pointerEvents: 'auto',
  },
  fallbackGestureArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'auto',
  },

  dragPreview: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 20, // Au-dessus de tout
    minWidth: 60,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5, // Pour Android
  },
  dragPreviewText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  extractingText: {
    color: 'white',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  centerTapZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'auto',
  },
  globalTapZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    pointerEvents: 'auto',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    backgroundColor: '#333',
    padding: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingTitle: {
    color: 'white',
    fontSize: 18,
    marginBottom: 10,
  },
  loadingSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContent: {
    backgroundColor: '#333',
    padding: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorMessage: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
  },
  errorSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  errorActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  errorButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  errorButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryErrorButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  secondaryErrorButtonText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: 'bold',
  },
  diagnosticButton: {
    backgroundColor: '#666',
    marginHorizontal: 5,
  },
});

export default VideoPlayerScreen; 