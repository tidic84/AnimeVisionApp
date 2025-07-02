import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
  TouchableWithoutFeedback,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useVideoPlayer, VideoView, VideoSource } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

import { RootStackScreenProps } from '../../types/navigation';
import { Episode, DownloadStatus, VideoQuality as AnimeVideoQuality } from '../../types/anime';
import apiService from '../../services/apiService';
import videoUrlExtractor from '../../services/VideoUrlExtractor';
import VideoOptionsModal, { VideoQuality } from '../../components/VideoOptionsModal';
import WebViewVideoPlayer from '../../components/WebViewVideoPlayer';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type VideoPlayerScreenProps = RootStackScreenProps<'VideoPlayer'>;

const VideoPlayerScreen: React.FC<VideoPlayerScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute<VideoPlayerScreenProps['route']>();
  const { episodeId, animeId, autoPlay = false, localFilePath, isOfflineMode = false } = route.params;

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

  // États pour les options vidéo
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(autoPlay);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentQuality, setCurrentQuality] = useState('auto');
  const [availableQualities, setAvailableQualities] = useState<VideoQuality[]>([
    { label: 'Auto', value: 'auto', url: '' }
  ]);

  // États pour la vidéo
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  
  // États pour le fallback WebView
  const [useWebViewPlayer, setUseWebViewPlayer] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string>('');
  const [showFallbackButton, setShowFallbackButton] = useState(false);

  // Configuration du player avec fallback
  const player = useVideoPlayer(
    videoSource || { uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' }, 
    (player) => {
    if (player && videoSource) {
        console.log('[VideoPlayer] 🎬 Initialisation du player avec URL:', typeof videoSource === 'object' ? videoSource.uri : videoSource);
      player.timeUpdateEventInterval = 0.5;
      player.playbackRate = playbackSpeed;
      if (autoPlay) {
        player.play();
      }
    }
    }
  );

  // Mettre à jour la source vidéo quand l'épisode change
  useEffect(() => {
    // Si on a un fichier local, l'utiliser en priorité
    if (isOfflineMode && localFilePath) {
      (async () => {
        try {
          // D'abord, chercher une playlist M3U8 locale associée
          const playlistPath = localFilePath.replace('.ts', '.m3u8');
          const playlistInfo = await FileSystem.getInfoAsync(playlistPath);
          
          let finalUri = localFilePath;
          
          if (playlistInfo.exists) {
            // Utiliser la playlist M3U8 si elle existe (meilleure qualité)
            finalUri = playlistPath;
            console.log('[VideoPlayer] 🎬 Playlist M3U8 locale trouvée, utilisation de la playlist complète');
          } else {
            // Sinon, vérifier que le fichier principal existe
            const fileInfo = await FileSystem.getInfoAsync(localFilePath);
            if (!fileInfo.exists) {
              console.error('[VideoPlayer] ❌ Fichier local non trouvé:', localFilePath);
              Alert.alert('Erreur', 'Le fichier vidéo téléchargé est introuvable');
              return;
            }
            console.log('[VideoPlayer] 📁 Utilisation du segment principal uniquement');
          }
          
          // Formater l'URI pour expo-video
          let localUri = finalUri;
          if (!finalUri.startsWith('file://')) {
            localUri = `file://${finalUri}`;
          }
          
          console.log(`[VideoPlayer] 📁 Fichier local configuré:`, localUri);
          
          const localVideoSource = { uri: localUri };
          setVideoSource(localVideoSource);
          
          // Ajouter un timer pour détecter si la vidéo locale ne se charge pas
          const localVideoTimer = setTimeout(() => {
            if (playerStatus === 'idle' || playerStatus === 'error') {
              console.warn('[VideoPlayer] ⚠️ Vidéo locale ne se charge pas, possibilité de problème de format');
              Alert.alert(
                'Problème de lecture', 
                'Le fichier vidéo téléchargé ne peut pas être lu. Cela peut être dû à un problème de format.',
                [
                  { text: 'OK', style: 'default' },
                  { text: 'Retélécharger', onPress: () => {
                    // TODO: Ajouter logique pour relancer le téléchargement
                    console.log('[VideoPlayer] 🔄 Demande de retéléchargement');
                  }}
                ]
              );
            }
          }, 5000); // 5 secondes pour se charger
          
          return () => clearTimeout(localVideoTimer);
          
        } catch (error) {
          console.error('[VideoPlayer] ❌ Erreur vérification fichier local:', error);
          Alert.alert('Erreur', 'Impossible de lire le fichier téléchargé');
        }
      })();
      return; // Sortir tôt, pas besoin de configurer les URLs de streaming
    }
    
    // Sinon, utiliser les URLs de streaming comme avant
    if (episode?.streamingUrls?.[0]?.url) {
      const newVideoSource = { uri: episode.streamingUrls[0].url };
      console.log('[VideoPlayer] 📺 Configuration nouvelle source vidéo:', newVideoSource.uri);
      setVideoSource(newVideoSource);
      
      // Si c'est une URL embed, préparer le fallback WebView
      if (episode.streamingUrls[0].url.includes('embed') || 
          episode.streamingUrls[0].url.includes('shell.php')) {
        setWebViewUrl(episode.streamingUrls[0].url);
        
        // Démarrer un timer pour détecter si la vidéo ne se charge pas
        const fallbackTimer = setTimeout(() => {
          if (playerStatus === 'idle' || playerStatus === 'error') {
            console.log('[VideoPlayer] 🔄 Vidéo ne se charge pas, proposition fallback WebView');
            setShowFallbackButton(true);
          }
        }, 8000); // 8 secondes pour laisser le temps au player de se charger
        
        return () => clearTimeout(fallbackTimer);
      }
    } else {
      console.log('[VideoPlayer] ❌ Aucune URL de streaming disponible');
      setVideoSource(null);
    }
  }, [episode, playerStatus, isOfflineMode, localFilePath]);

  const duration = player?.duration || 0;

  // Navigation entre épisodes
  const currentEpisodeIndex = allEpisodes.findIndex(ep => ep.id === episodeId);
  const hasPreviousEpisode = currentEpisodeIndex > 0;
  const hasNextEpisode = currentEpisodeIndex < allEpisodes.length - 1;
  const previousEpisode = hasPreviousEpisode ? allEpisodes[currentEpisodeIndex - 1] : null;
  const nextEpisode = hasNextEpisode ? allEpisodes[currentEpisodeIndex + 1] : null;

  // Gestion barre de progression
  const [progressBarWidth, setProgressBarWidth] = useState(200);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const progressBarRef = useRef<View>(null);
  const [useFallbackDrag, setUseFallbackDrag] = useState(false);
  
  // États pour la preview de drag
  const [dragPreviewVisible, setDragPreviewVisible] = useState(false);
  const [dragPreviewPosition, setDragPreviewPosition] = useState({ x: 0, y: 0 });
  const [dragPreviewTime, setDragPreviewTime] = useState(0);

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

    const timeUpdateSubscription = player.addListener('timeUpdate', (payload: any) => {
      setCurrentTime(payload.currentTime);
      
      // Détecter la fin de vidéo (95% ou plus)
      if (duration > 0 && payload.currentTime >= duration * 0.95) {
        showControlsFunc();
        // Auto-play épisode suivant si activé et pas déjà en cours
        if (autoPlayEnabled && hasNextEpisode && payload.currentTime >= duration * 0.98) {
          setTimeout(() => {
            goToNextEpisode();
          }, 2000);
        }
      }
    });

    const playingChangeSubscription = player.addListener('playingChange', (payload: any) => {
      setIsPlaying(payload.isPlaying);
    });

    const statusChangeSubscription = player.addListener('statusChange', (payload: any) => {
      setPlayerStatus(payload.status);
      
      // Masquer les contrôles natifs en cas de fin de vidéo
      if (payload.status === 'idle' || payload.status === 'readyToPlay') {
        showControlsFunc();
      }
    });

    return () => {
      timeUpdateSubscription.remove();
      playingChangeSubscription.remove();
      statusChangeSubscription.remove();
    };
  }, [player, autoPlayEnabled, hasNextEpisode, duration]);

  // Appliquer la vitesse de lecture
  useEffect(() => {
    if (player) {
      player.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, player]);

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      hideControls();
    }, 3000);
  };

  const showControlsFunc = () => {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    resetControlsTimeout();
  };

  const hideControls = () => {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowControls(false);
    });
  };

  const loadEpisodeData = async () => {
    try {
      setLoading(true);
      setExtractingHLS(false);

      // Si on est en mode hors ligne avec un fichier local, pas besoin de charger depuis l'API
      if (isOfflineMode && localFilePath) {
        console.log('[VideoPlayer] 📁 Mode hors ligne - utilisation fichier local:', localFilePath);
        
        // Créer un épisode minimal pour l'interface
        const offlineEpisode: Episode = {
          id: episodeId,
          title: `Épisode téléchargé`,
          animeId: animeId,
          animeTitle: 'Téléchargement local',
          number: 1,
          thumbnail: '',
          duration: 0,
          watchProgress: 0,
          isWatched: false,
          downloadStatus: DownloadStatus.DOWNLOADED,
          streamingUrls: [{ quality: AnimeVideoQuality.HIGH, url: localFilePath }]
        };
        
        setEpisode(offlineEpisode);
        setAllEpisodes([offlineEpisode]);
        setAnimeTitle('Téléchargement local');
        
        console.log('[VideoPlayer] ✅ Mode hors ligne configuré');
        return;
      }

      // D'abord récupérer l'épisode depuis l'API (mode en ligne)
      const episodeData = await apiService.getEpisodeById(episodeId);

      if (!episodeData) {
        throw new Error('Épisode non trouvé');
      }

      setEpisode(episodeData);

      // Utiliser l'animeId de l'épisode ou celui passé en paramètre
      const actualAnimeId = episodeData.animeId || animeId;
      
      // Ensuite récupérer tous les épisodes de l'animé avec l'animeId correct
      let allEpisodesData: Episode[] = [];
      if (actualAnimeId && actualAnimeId.trim() !== '' && !actualAnimeId.startsWith('season_')) {
        try {
          allEpisodesData = await apiService.getAnimeEpisodes(actualAnimeId);
        } catch (error) {
          console.warn('[VideoPlayer] Impossible de récupérer tous les épisodes:', error);
          // Si on ne peut pas récupérer tous les épisodes, au moins avoir l'épisode actuel
          allEpisodesData = [episodeData];
        }
      } else {
        // Si pas d'animeId valide, au moins avoir l'épisode actuel
        allEpisodesData = [episodeData];
      }

      setAllEpisodes(allEpisodesData);
      
      // Récupérer le vrai titre de l'animé
      if (episodeData.animeTitle) {
        setAnimeTitle(episodeData.animeTitle);
      } else if (actualAnimeId && actualAnimeId.trim() !== '' && !actualAnimeId.startsWith('season_')) {
        // Si pas de titre dans l'épisode, récupérer depuis l'API
        try {
          const animeDetails = await apiService.getAnimeDetails(actualAnimeId);
          setAnimeTitle(animeDetails.title || 'Titre inconnu');
        } catch (error) {
          console.warn('[VideoPlayer] Impossible de récupérer le titre de l\'animé:', error);
          setAnimeTitle('Titre inconnu');
        }
      } else {
        setAnimeTitle('Titre inconnu');
      }

      // Toujours essayer d'extraire les vraies URLs de streaming
      // car l'API nous donne des URLs d'embed, pas des URLs directes
      console.log('[VideoPlayer] 🎬 Début extraction HLS pour épisode', episodeData.id);
        setExtractingHLS(true);
        
        const extractionResult = await videoUrlExtractor.extractHLSForEpisode(episodeData.id);
      console.log('[VideoPlayer] 📊 Résultat extraction:', extractionResult);

        if (extractionResult.success && extractionResult.urls.length > 0) {
        console.log('[VideoPlayer] ✅ Extraction HLS réussie:', extractionResult.urls.length, 'URLs trouvées');
          const updatedEpisode = { 
            ...episodeData, 
            streamingUrls: extractionResult.urls.map(url => ({
              quality: 'HIGH' as any,
              url: url.url
            }))
          };
          setEpisode(updatedEpisode);
        console.log('[VideoPlayer] URLs HLS configurées:', updatedEpisode.streamingUrls);
        } else {
        // Si l'extraction échoue, essayer d'utiliser les URLs d'embed directement
        console.warn('[VideoPlayer] ❌ Extraction HLS échouée:', extractionResult.error);
        console.warn('[VideoPlayer] 🔄 Tentative avec URLs d\'embed directement');
        
        if (episodeData.streaming_servers && episodeData.streaming_servers.length > 0) {
          // Stratégie de fallback intelligente: prioriser les serveurs par compatibilité
          const sortedServers = [...episodeData.streaming_servers].sort((a, b) => {
            // Priorité par qualité
            const qualityPriorityA = a.quality === '1080p' ? 4 : (a.quality === 'HD' ? 3 : (a.quality === 'SD' ? 2 : 1));
            const qualityPriorityB = b.quality === '1080p' ? 4 : (b.quality === 'HD' ? 3 : (b.quality === 'SD' ? 2 : 1));
            
            if (qualityPriorityA !== qualityPriorityB) {
              return qualityPriorityB - qualityPriorityA;
            }
            
            // Priorité par serveur (certains plus compatibles avec React Native)
            const getServerPriority = (name: string) => {
              if (name.includes('OneUpload')) return 4;
              if (name.includes('Serveur 2')) return 3;
              if (name.includes('Serveur 1')) return 2;
              return 1;
            };
            
            return getServerPriority(b.name) - getServerPriority(a.name);
          });
          
          const embedUrls = sortedServers.map(server => ({
            quality: server.quality.includes('HD') || server.quality.includes('1080p') ? 'HIGH' as any : 'MEDIUM' as any,
            url: server.url
          }));
          
          const updatedEpisode = { 
            ...episodeData, 
            streamingUrls: embedUrls
          };
          setEpisode(updatedEpisode);
          
          console.log('[VideoPlayer] 🔄 Mode fallback activé - utilisation URLs embed');
          console.log(`[VideoPlayer] 📺 Serveur prioritaire: ${sortedServers[0].name} (${sortedServers[0].quality})`);
          console.log(`[VideoPlayer] 🔗 URL: ${sortedServers[0].url}`);
          
          // Note: Pas d'alerte, on essaie silencieusement avec les embed URLs
          // Si ça ne marche pas, l'utilisateur verra un écran noir et pourra essayer un autre serveur
        } else {
          console.error('[VideoPlayer] ❌ Aucune source de streaming disponible');
          throw new Error('Aucun serveur de streaming trouvé pour cet épisode');
        }
      }

    } catch (error) {
      console.error('[VideoPlayer] Erreur lors du chargement:', error);
      Alert.alert(
        'Erreur',
        'Impossible de charger la vidéo. Veuillez réessayer.',
        [
          { text: 'Retour', onPress: () => navigation.goBack() },
          { text: 'Réessayer', onPress: () => loadEpisodeData() }
        ]
      );
    } finally {
      setLoading(false);
      setExtractingHLS(false);
    }
  };

  const togglePlayPause = () => {
    if (!player) return;
    
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    showControlsFunc();
  };

  const seekTo = (time: number) => {
    if (player && duration > 0) {
      const clampedTime = Math.max(0, Math.min(time, duration));
      player.currentTime = clampedTime;
      setCurrentTime(clampedTime);
    }
  };

  const skipForward = (seconds: number = 10) => {
    const newTime = Math.min(currentTime + seconds, duration);
    seekTo(newTime);
    showControlsFunc();
  };

  const skipBackward = (seconds: number = 10) => {
    const newTime = Math.max(currentTime - seconds, 0);
    seekTo(newTime);
    showControlsFunc();
  };

  const showSkipAnimation = (direction: 'left' | 'right', seconds: number = 10) => {
    setAnimatingSkip(direction);
    const animValue = direction === 'left' ? skipAnimLeft : skipAnimRight;
    
    Animated.sequence([
      Animated.timing(animValue, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => {
      setAnimatingSkip(null);
    });
  };

  const goToPreviousEpisode = () => {
    if (previousEpisode) {
      (navigation as any).replace('VideoPlayer', {
        episodeId: previousEpisode.id,
        animeId: animeId,
        autoPlay: autoPlayEnabled
      });
    }
  };

  const goToNextEpisode = () => {
    if (nextEpisode) {
      (navigation as any).replace('VideoPlayer', {
        episodeId: nextEpisode.id,
        animeId: animeId,
        autoPlay: autoPlayEnabled
      });
    }
  };

  // CORRECTION: Fonction handleProgressPress corrigée
  const handleProgressPress = (event: any) => {
    if (isDragging) return;
    
    const { locationX } = event.nativeEvent;
    const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const newTime = percentage * duration;
    
    // Appliquer immédiatement le changement
    seekTo(newTime);
    setDragPreviewVisible(false); // Masquer la bulle
    showControlsFunc();
    
    // S'assurer que la bulle disparaît après un délai court
    setTimeout(() => {
      setDragPreviewVisible(false);
    }, 100);
  };

  const handleScreenPress = (event: any) => {
    const now = Date.now();
    const TAP_DELAY = 250;
    const { locationX, pageX } = event.nativeEvent;
    
    const leftZoneEnd = screenWidth * 0.475;
    const rightZoneStart = screenWidth * 0.525;
    const absoluteX = pageX || locationX;
    
    let currentSide: 'left' | 'right' | null = null;
    if (absoluteX <= leftZoneEnd) {
      currentSide = 'left';
    } else if (absoluteX >= rightZoneStart) {
      currentSide = 'right';
    } else {
      showControlsFunc();
      return;
    }
    
    showControlsFunc();
    
    if (lastTap && (now - lastTap) < TAP_DELAY && tapSide === currentSide) {
      const newTapCount = tapCount + 1;
      setTapCount(newTapCount);
      setLastTap(now);
      
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      
      tapTimeoutRef.current = setTimeout(() => {
        const seconds = (newTapCount - 1) * 10;
        if (seconds > 0) {
          if (currentSide === 'right') {
            skipForward(seconds);
            showSkipAnimation('right', seconds);
          } else {
            skipBackward(seconds);
            showSkipAnimation('left', seconds);
          }
        }
        setTapCount(0);
        setTapSide(null);
        setLastTap(0);
      }, TAP_DELAY);
      
    } else {
      setTapCount(1);
      setTapSide(currentSide);
      setLastTap(now);
      
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      
      tapTimeoutRef.current = setTimeout(() => {
        if (showControls) {
          hideControls();
        }
        setTapCount(0);
        setTapSide(null);
        setLastTap(0);
      }, TAP_DELAY);
    }
  };

  // CORRECTION: Gestionnaire de drag corrigé
  const handleProgressGesture = (event: any) => {
    const { state, x, absoluteX } = event.nativeEvent;
    const FIXED_BUBBLE_Y = screenHeight - 150; // Position proche de la progress bar (150px du bas)
    
    switch (state) {
      case State.BEGAN:
        setIsDragging(true);
        setDragPreviewVisible(true);
        showControlsFunc();
        
        const initialPercentage = Math.max(0, Math.min(1, x / progressBarWidth));
        const initialTime = initialPercentage * duration;
        setDragPosition(initialPercentage);
        setDragPreviewTime(initialTime);
        // Position Y fixe pour la bulle, proche de la progress bar
        setDragPreviewPosition({ x: absoluteX, y: FIXED_BUBBLE_Y });
        
        // Timeout pour faire disparaître la bulle si on reste appuyé sans bouger
        setTimeout(() => {
          if (isDragging) {
            setDragPreviewVisible(false);
          }
        }, 2000); // 2 secondes
        break;
        
      case State.ACTIVE:
        const percentage = Math.max(0, Math.min(1, x / progressBarWidth));
        const previewTime = percentage * duration;
        setDragPosition(percentage);
        setDragPreviewTime(previewTime);
        // Position Y fixe pour la bulle, seul X change
        setDragPreviewPosition({ x: absoluteX, y: FIXED_BUBBLE_Y });
        showControlsFunc();
        break;
        
      case State.END:
      case State.CANCELLED:
      case State.FAILED:
        const finalPercentage = Math.max(0, Math.min(1, x / progressBarWidth));
        const newTime = finalPercentage * duration;
        
        setIsDragging(false);
        setDragPreviewVisible(false);
        seekTo(newTime);
        showControlsFunc();
        break;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Fonctions pour le fallback WebView
  const switchToWebViewPlayer = () => {
    console.log('[VideoPlayer] 🔄 Basculement vers lecteur WebView');
    setUseWebViewPlayer(true);
    setShowFallbackButton(false);
  };

  const switchBackToNativePlayer = () => {
    console.log('[VideoPlayer] 🔄 Retour au lecteur natif');
    setUseWebViewPlayer(false);
    setShowFallbackButton(false);
  };

  // Affichage de chargement
  if (loading || extractingHLS) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </View>
    );
  }

  // Affichage d'erreur
  if (!episode || !videoSource) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>Impossible de charger la vidéo</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadEpisodeData}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Calcul de la position de la barre de progression
  const progressPercentage = isDragging ? dragPosition : (duration > 0 ? currentTime / duration : 0);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Lecteur WebView (fallback) */}
      {useWebViewPlayer && webViewUrl ? (
        <WebViewVideoPlayer
          embedUrl={webViewUrl}
          onClose={switchBackToNativePlayer}
          style={styles.webViewPlayer}
        />
      ) : (
        <>
      {/* Vidéo en plein écran */}
      <VideoView
        style={styles.videoFullScreen}
        player={player}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        showsTimecodes={false}
        nativeControls={false}
        contentFit="contain"
      />

      {/* Zone de tap globale */}
      <TouchableWithoutFeedback onPress={handleScreenPress}>
        <View style={styles.globalTapZone}>
          
          {/* Overlay d'obscurcissement quand les contrôles sont visibles */}
          {showControls && (
            <Animated.View 
              style={[
                styles.darkOverlay, 
                { opacity: Animated.multiply(controlsOpacity, 0.3) }
              ]} 
            />
          )}
          
          {/* Overlay des contrôles */}
          {showControls && (
            <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
              
              {/* Section du haut */}
              <View style={styles.topSection}>
                <View style={styles.headerContent}>
                  <View style={styles.titleSection}>
                    <View style={styles.titleRow}>
                    <Text style={styles.animeTitle} numberOfLines={1}>
                      {animeTitle}
                    </Text>
                      {isOfflineMode && (
                        <View style={styles.offlineBadge}>
                          <Ionicons name="download" size={12} color="#4CAF50" />
                          <Text style={styles.offlineText}>Hors ligne</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.episodeTitle} numberOfLines={1}>
                      Épisode {episode?.number || 1}{episode?.title && ` - ${episode.title}`}
                    </Text>
                  </View>
                  <View style={styles.controlsSection}>
                    {/* Boutons navigation épisodes en haut sans texte */}
                    <TouchableOpacity 
                      style={[styles.headerButton, !hasPreviousEpisode && styles.disabledButton]}
                      onPress={goToPreviousEpisode}
                      disabled={!hasPreviousEpisode}
                    >
                      <Ionicons name="play-skip-back" size={24} color="white" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.headerButton, !hasNextEpisode && styles.disabledButton]}
                      onPress={goToNextEpisode}
                      disabled={!hasNextEpisode}
                    >
                      <Ionicons name="play-skip-forward" size={24} color="white" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.headerButton} 
                      onPress={() => setOptionsVisible(true)}
                    >
                      <Ionicons name="settings-outline" size={24} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.headerButton} 
                      onPress={() => navigation.goBack()}
                    >
                      <Ionicons name="close" size={24} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Section centrale */}
              <View style={styles.centerSection}>
                {(loading || extractingHLS || playerStatus === 'loading') ? (
                  <View style={styles.playPauseButton}>
                    <ActivityIndicator size="large" color="white" />
                  </View>
                ) : (
                  <TouchableOpacity style={styles.playPauseButton} onPress={togglePlayPause}>
                    <Ionicons 
                      name={isPlaying ? "pause" : "play"} 
                      size={40} 
                      color="white" 
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Section du bas - seulement la progress bar */}
              <View style={styles.bottomSection}>
                <View style={styles.progressSection}>
                  <Text style={styles.timeText}>
                    {formatTime(currentTime)}
                  </Text>
                  
                  {/* Barre de progression avec drag corrigé */}
                  <View style={styles.progressTrack}>
                    <PanGestureHandler 
                      onGestureEvent={handleProgressGesture}
                      onHandlerStateChange={handleProgressGesture}
                    >
                      <View
                        ref={progressBarRef}
                        style={styles.progressBackground}
                        onLayout={(event) => {
                          setProgressBarWidth(event.nativeEvent.layout.width);
                        }}
                      >
                        <View 
                          style={[
                            styles.progressForeground, 
                            { width: `${progressPercentage * 100}%` }
                          ]} 
                        />
                        <View 
                          style={[
                            styles.progressThumb, 
                            { left: `${progressPercentage * 100}%` }
                          ]} 
                        />
                      </View>
                    </PanGestureHandler>
                    
                    {/* Zone de clic pour la progress bar */}
                    <TouchableOpacity 
                      style={styles.progressClickZone}
                      onPress={handleProgressPress}
                      activeOpacity={1}
                    />
                  </View>
                  
                  <Text style={styles.timeText}>
                    {formatTime(duration)}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Animations de skip */}
          {animatingSkip === 'left' && (
            <Animated.View style={[styles.skipIndicatorLeft, { opacity: skipAnimLeft }]}>
              <Ionicons name="play-back" size={40} color="white" />
              <Text style={styles.skipText}>{skipSeconds}s</Text>
            </Animated.View>
          )}

          {animatingSkip === 'right' && (
            <Animated.View style={[styles.skipIndicatorRight, { opacity: skipAnimRight }]}>
              <Ionicons name="play-forward" size={40} color="white" />
              <Text style={styles.skipText}>{skipSeconds}s</Text>
            </Animated.View>
          )}

          {/* Preview de drag */}
          {dragPreviewVisible && (
            <View 
              style={[
                styles.dragPreview, 
                { 
                  left: dragPreviewPosition.x - 30, 
                  top: dragPreviewPosition.y 
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

          {/* Bouton de fallback WebView */}
          {showFallbackButton && (
            <View style={styles.fallbackButtonContainer}>
              <TouchableOpacity style={styles.fallbackButton} onPress={switchToWebViewPlayer}>
                <Ionicons name="globe-outline" size={20} color="#fff" />
                <Text style={styles.fallbackButtonText}>Lecteur Web</Text>
              </TouchableOpacity>
            </View>
          )}

      {/* CORRECTION: Modal des options ajouté */}
      <VideoOptionsModal
        visible={optionsVisible}
        onClose={() => setOptionsVisible(false)}
        availableQualities={availableQualities}
        currentQuality={currentQuality}
        onQualityChange={(quality) => {
          setCurrentQuality(quality.value);
        }}
        currentSpeed={playbackSpeed}
        onSpeedChange={(speed) => {
          setPlaybackSpeed(speed);
        }}
        autoPlay={autoPlayEnabled}
        onAutoPlayChange={(enabled) => {
          setAutoPlayEnabled(enabled);
        }}
      />
        </>
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
  globalTapZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    pointerEvents: 'auto',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
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
    width: '100%',
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
    zIndex: 10,
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
    zIndex: 10,
    borderRadius: 40,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'box-none',
    width: '100%',
    marginBottom: 20,
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
    paddingVertical: 15,
    pointerEvents: 'auto',
    zIndex: 10,
    minWidth: 100,
    width: '100%',
  },
  progressBackground: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
    width: '100%',
    minWidth: 100,
  },
  progressForeground: {
    height: 8,
    backgroundColor: '#FF6B35',
    borderRadius: 4,
    minWidth: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 16,
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
  progressClickZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'auto',
  },
  skipIndicatorLeft: {
    position: 'absolute',
    left: 80,
    top: '50%',
    transform: [{ translateY: -40 }],
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
  },
  skipIndicatorRight: {
    position: 'absolute',
    right: 80,
    top: '50%',
    transform: [{ translateY: -40 }],
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
  },
  skipText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
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
  dragPreview: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 25,
    minWidth: 60,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  dragPreviewText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
    zIndex: 10,
  },
  webViewPlayer: {
    flex: 1,
  },
  fallbackButtonContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -75 }, { translateY: 50 }],
    zIndex: 20,
  },
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    gap: 8,
  },
  fallbackButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderColor: '#4CAF50',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  offlineText: {
    color: '#4CAF50',
    fontSize: 10,
    fontWeight: '600',
  },
});

export default VideoPlayerScreen; 