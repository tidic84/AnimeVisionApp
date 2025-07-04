import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  FlatList,
  useColorScheme,
  Alert,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { RootStackScreenProps } from '../../types/navigation';
import { Anime, Episode, DownloadStatus, VideoQuality } from '../../types/anime';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import downloadService from '../../services/downloadService';
import { SkeletonCard } from '../../components';

const { width: screenWidth } = Dimensions.get('window');

type AnimeDetailScreenProps = RootStackScreenProps<'AnimeDetail'>;

const AnimeDetailScreen: React.FC<AnimeDetailScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute<AnimeDetailScreenProps['route']>();
  const { animeId } = route.params;
  const colorScheme = useColorScheme();

  const [anime, setAnime] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInWatchlist, setIsInWatchlist] = useState(false);

  const colors = {
    light: {
      background: '#ffffff',
      text: '#1e293b',
      textSecondary: '#64748b',
      surface: '#f8fafc',
      border: '#e2e8f0',
      primaryStart: '#219B9B',
      primaryEnd: '#0F6B7B',
      primary: '#0F6B7B',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
    dark: {
      background: '#0f172a',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      surface: '#1e293b',
      border: '#334155',
      primaryStart: '#219B9B',
      primaryEnd: '#0F6B7B',
      primary: '#0F6B7B',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
    },
  }[colorScheme ?? 'light'];

  useEffect(() => {
    loadAnimeDetails();
    checkWatchlistStatus();
  }, [animeId]);

  const loadAnimeDetails = async () => {
    try {
      setLoading(true);
      console.log(`[AnimeDetail] Chargement de l'anime ${animeId} via API`);
      
      let animeDetails = null;
      let animeEpisodes: Episode[] = [];

      // 1. Essayer d'abord de charger via l'API directe avec gestion d'erreur
      try {
        animeDetails = await apiService.getAnimeDetails(animeId);
        console.log('[AnimeDetail] Détails anime chargés via API:', animeDetails.title);
      } catch (apiError: any) {
        console.warn('[AnimeDetail] API détails non disponible pour ID', animeId, ':', apiError.message);
        
        // Si l'anime n'existe pas (404, "not found", etc.), on essaie une approche différente
        if (apiError.message.includes('not found') || apiError.message.includes('404')) {
          console.log('[AnimeDetail] ID invalide détecté, tentative de récupération via liste d\'animés...');
          
          // Essayer de trouver l'anime dans la liste des animés populaires/récents
          try {
            const animeList = await apiService.getAnimeList(1, 50); // Récupérer plus d'animés
            const foundAnime = animeList.animes.find(anime => anime.id === animeId);
            
            if (foundAnime) {
              animeDetails = foundAnime;
              console.log('[AnimeDetail] Anime trouvé dans la liste:', foundAnime.title);
            }
          } catch (listError) {
            console.warn('[AnimeDetail] Impossible de récupérer la liste d\'animés:', listError);
          }
        }
      }

      // 2. Essayer de charger les épisodes (pour récupérer des infos supplémentaires)
      try {
        animeEpisodes = await apiService.getAnimeEpisodes(animeId);
        console.log(`[AnimeDetail] ${animeEpisodes.length} épisodes chargés`);

        // Si on n'a pas les détails de l'anime mais qu'on a des épisodes, 
        // créer les détails basiques depuis les épisodes
        if (!animeDetails && animeEpisodes.length > 0 && animeEpisodes[0].animeTitle) {
          animeDetails = {
            id: animeId,
            title: animeEpisodes[0].animeTitle,
            originalTitle: animeEpisodes[0].animeTitle,
            synopsis: 'Synopsis disponible après consultation des épisodes.',
            genres: [],
            studio: 'Studio inconnu',
            year: new Date().getFullYear(),
            rating: 0,
            status: 'ONGOING' as any,
            thumbnail: animeEpisodes[0].thumbnail || '',
            banner: animeEpisodes[0].thumbnail || '',
            episodeCount: animeEpisodes.length,
            duration: 24
          };
          console.log('[AnimeDetail] Détails anime créés depuis les épisodes:', animeDetails.title);
        }
      } catch (episodeError) {
        console.warn('[AnimeDetail] Erreur lors du chargement des épisodes:', episodeError);
      }

      // 3. Si on n'a toujours rien, créer un fallback avec l'ID fourni
      if (!animeDetails) {
        // Vérifier si l'ID semble invalide (trop petit, probablement ancien)
        const numericId = parseInt(animeId);
        if (numericId < 1000) {
          console.warn('[AnimeDetail] ID suspect détecté (< 1000), probablement un ancien ID local');
          Alert.alert(
            'Anime introuvable', 
            'Cet anime n\'est plus disponible. Il s\'agit probablement d\'anciennes données. Veuillez actualiser la liste des animés.',
            [
              { text: 'Retour', onPress: () => navigation.goBack() },
              { 
                text: 'Voir le catalogue', 
                onPress: () => {
                  navigation.goBack();
                  (navigation as any).navigate('Catalog');
                }
              }
            ]
          );
          return;
        }

        // Sinon, créer un anime basique
        animeDetails = {
          id: animeId,
          title: `Anime ${animeId}`,
          originalTitle: `Anime ${animeId}`,
          synopsis: 'Les détails de cet anime ne sont pas disponibles pour le moment. Il s\'agit peut-être d\'un nouvel anime ou les données sont en cours de mise à jour.',
          genres: [],
          studio: 'Studio inconnu',
          year: new Date().getFullYear(),
          rating: 0,
          status: 'ONGOING' as any,
          thumbnail: '',
          banner: '',
          episodeCount: animeEpisodes.length,
          duration: 24
        };
        console.log('[AnimeDetail] Utilisation des détails fallback pour ID:', animeId);
      }

      // Corriger le nombre d'épisodes avec les données réelles
      if (animeDetails && animeEpisodes.length > 0) {
        animeDetails.episodeCount = animeEpisodes.length;
      }

      setAnime(animeDetails);
      setEpisodes(animeEpisodes);

      // Sauvegarder en base locale si on a des données valides
      if (animeDetails && animeDetails.title !== `Anime ${animeId}`) {
        await databaseService.saveAnime(animeDetails);
      }
      
      for (const episode of animeEpisodes) {
        await databaseService.saveEpisode(episode);
      }
      
    } catch (error) {
      console.error('Erreur lors du chargement des détails:', error);
      Alert.alert(
        'Erreur de chargement', 
        'Impossible de charger les détails de cet anime. Vérifiez votre connexion internet.',
        [
          { text: 'Retour', onPress: () => navigation.goBack() },
          { text: 'Réessayer', onPress: () => loadAnimeDetails() }
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const checkWatchlistStatus = async () => {
    try {
      const lists = await databaseService.getAnimeLists();
      const defaultList = lists.find(list => list.isDefault);
      if (defaultList) {
        setIsInWatchlist(defaultList.animeIds.includes(animeId));
      }
    } catch (error) {
      console.error('Erreur lors de la vérification de la watchlist:', error);
    }
  };

  const toggleWatchlist = async () => {
    try {
      const lists = await databaseService.getAnimeLists();
      const defaultList = lists.find(list => list.isDefault);
      
      if (defaultList) {
        if (isInWatchlist) {
          await databaseService.removeAnimeFromList(defaultList.id, animeId);
          setIsInWatchlist(false);
          Alert.alert('Retiré', 'Animé retiré de votre liste');
        } else {
          await databaseService.addAnimeToList(defaultList.id, animeId);
          setIsInWatchlist(true);
          Alert.alert('Ajouté', 'Animé ajouté à votre liste');
        }
      }
    } catch (error) {
      console.error('Erreur lors de la modification de la watchlist:', error);
      Alert.alert('Erreur', 'Impossible de modifier la liste');
    }
  };

  const playEpisode = (episode: Episode) => {
    navigation.navigate('VideoPlayer', {
      episodeId: episode.id,
      animeId: episode.animeId,
      autoPlay: true,
    });
  };

  const handleDownloadEpisode = async (episode: Episode) => {
    try {
      if (episode.downloadStatus === DownloadStatus.DOWNLOADED) {
        Alert.alert(
          'Épisode déjà téléchargé',
          'Cet épisode est déjà téléchargé. Voulez-vous le supprimer ?',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: async () => {
                await downloadService.deleteDownload(episode.id);
                // Mettre à jour le statut localement sans recharger
                setEpisodes(prevEpisodes => 
                  prevEpisodes.map(ep => 
                    ep.id === episode.id 
                      ? { ...ep, downloadStatus: DownloadStatus.NOT_DOWNLOADED }
                      : ep
                  )
                );
              }
            }
          ]
        );
        return;
      }

      if (episode.downloadStatus === DownloadStatus.DOWNLOADING) {
        Alert.alert(
          'Téléchargement en cours',
          'Voulez-vous annuler le téléchargement ?',
          [
            { text: 'Non', style: 'cancel' },
            {
              text: 'Annuler',
              style: 'destructive',
              onPress: async () => {
                await downloadService.cancelDownload(episode.id);
                // Mettre à jour le statut localement sans recharger
                setEpisodes(prevEpisodes => 
                  prevEpisodes.map(ep => 
                    ep.id === episode.id 
                      ? { ...ep, downloadStatus: DownloadStatus.NOT_DOWNLOADED }
                      : ep
                  )
                );
              }
            }
          ]
        );
        return;
      }

      // Vérifier si l'épisode a des URLs de streaming
      if (!episode.streamingUrls || episode.streamingUrls.length === 0) {
        Alert.alert(
          'Téléchargement impossible',
          'Aucune URL de streaming disponible pour cet épisode.'
        );
        return;
      }

      // Choisir la qualité de téléchargement
      const qualities = episode.streamingUrls.map(url => url.quality);
      const preferredQuality = qualities.includes(VideoQuality.HIGH) 
        ? VideoQuality.HIGH 
        : qualities[0];

      await downloadService.startDownload(episode, preferredQuality);
      
      Alert.alert(
        'Téléchargement démarré',
        `Le téléchargement de "${episode.title}" a commencé.`
      );

      // Mettre à jour le statut localement sans recharger toute la page
      setEpisodes(prevEpisodes => 
        prevEpisodes.map(ep => 
          ep.id === episode.id 
            ? { ...ep, downloadStatus: DownloadStatus.DOWNLOADING }
            : ep
        )
      );
    } catch (error: any) {
      Alert.alert(
        'Erreur de téléchargement',
        error.message || 'Impossible de démarrer le téléchargement.'
      );
    }
  };

  const getEpisodeStatusColor = (episode: Episode) => {
    if (episode.isWatched) return colors.success;
    if (episode.watchProgress > 0) return colors.warning;
    return colors.textSecondary;
  };

  const getEpisodeStatusIcon = (episode: Episode) => {
    if (episode.isWatched) return 'checkmark-circle';
    if (episode.watchProgress > 0) return 'play-circle';
    return 'ellipse-outline';
  };

  const getDownloadIcon = (episode: Episode) => {
    switch (episode.downloadStatus) {
      case DownloadStatus.DOWNLOADED:
        return 'checkmark-circle';
      case DownloadStatus.DOWNLOADING:
        return 'download';
      case DownloadStatus.FAILED:
        return 'alert-circle';
      default:
        return 'download-outline';
    }
  };

  const getDownloadColor = (episode: Episode) => {
    switch (episode.downloadStatus) {
      case DownloadStatus.DOWNLOADED:
        return colors.success;
      case DownloadStatus.DOWNLOADING:
        return colors.primary;
      case DownloadStatus.FAILED:
        return colors.error;
      default:
        return colors.textSecondary;
    }
  };

  const renderEpisode = ({ item: episode }: { item: Episode }) => (
    <View style={[styles.episodeItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.episodeMainContent}
        onPress={() => playEpisode(episode)}
      >
        <Image
          source={{ uri: episode.thumbnail.includes("placeholder") ? anime?.banner : episode.thumbnail }}
          style={styles.episodeThumbnail}
        />
        
        <View style={styles.episodeInfo}>
          <Text style={[styles.episodeTitle, { color: colors.text }]} numberOfLines={2}>
            {episode.title}
          </Text>
          <Text style={[styles.episodeNumber, { color: colors.textSecondary }]}>
            Épisode {episode.number}
          </Text>
          <Text style={[styles.episodeDuration, { color: colors.textSecondary }]}>
            {Math.floor(episode.duration / 60)} min
          </Text>
        </View>

        <View style={styles.episodeStatus}>
          <Ionicons
            name={getEpisodeStatusIcon(episode)}
            size={24}
            color={getEpisodeStatusColor(episode)}
          />
          {episode.watchProgress > 0 && !episode.isWatched && (
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.primary, width: `${episode.watchProgress}%` }
                ]}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.downloadButton}
        onPress={() => handleDownloadEpisode(episode)}
      >
        <Ionicons
          name={getDownloadIcon(episode)}
          size={20}
          color={getDownloadColor(episode)}
        />
      </TouchableOpacity>
    </View>
  );

  const renderGenre = (genre: string, index: number) => (
    <View key={index} style={[styles.genreTag, { backgroundColor: colors.primary }]}>
      <Text style={[styles.genreText, { color: colors.background }]}>{genre}</Text>
    </View>
  );

  // Squelette de chargement complet
  const renderLoadingSkeleton = () => (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView style={styles.scrollView}>
        {/* Header Banner Skeleton */}
        <View style={styles.header}>
          <View style={[styles.bannerSkeleton, { 
            backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f1f5f9' 
          }]}>
            {/* Back button skeleton */}
            <View style={[styles.backButtonSkeleton, {
              backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
            }]} />
            
            {/* Watchlist button skeleton */}
            <View style={[styles.watchlistButtonSkeleton, {
              backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
            }]} />
          </View>
        </View>

        {/* Main Info Section Skeleton */}
        <View style={styles.mainInfoSkeleton}>
          {/* Poster + Info Section */}
          <View style={styles.posterSectionSkeleton}>
            {/* Poster Skeleton */}
            <View style={[styles.posterSkeleton, {
              backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
            }]}>
            </View>
            
            {/* Info Section */}
            <View style={styles.infoSectionSkeleton}>
              {/* Title */}
              <View style={[styles.skeletonLine, { 
                width: '85%', 
                height: 28, 
                marginBottom: 12,
                backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
              }]} />
              
              {/* Metadata items */}
              <View style={styles.metadataSkeleton}>
                <View style={[styles.skeletonLine, { 
                  width: 70, 
                  height: 18, 
                  marginBottom: 6,
                  backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
                }]} />
                <View style={[styles.skeletonLine, { 
                  width: 60, 
                  height: 18, 
                  marginBottom: 6,
                  backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
                }]} />
                <View style={[styles.skeletonLine, { 
                  width: 90, 
                  height: 18, 
                  marginBottom: 12,
                  backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
                }]} />
              </View>
              
              {/* Studio */}
              <View style={[styles.skeletonLine, { 
                width: 120, 
                height: 16,
                backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'
              }]} />
            </View>
          </View>

          {/* Genres Section Skeleton */}
          <View style={styles.genresSectionSkeleton}>
            <View style={[styles.skeletonLine, { 
              width: 80, 
              height: 22, 
              marginBottom: 12,
              backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
            }]} />
            <View style={styles.genresRowSkeleton}>
              {Array(4).fill(null).map((_, index) => (
                <View key={index} style={[styles.genreTagSkeleton, {
                  backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                }]} />
              ))}
            </View>
          </View>

          {/* Synopsis Section Skeleton */}
          <View style={styles.synopsisSectionSkeleton}>
            <View style={[styles.skeletonLine, { 
              width: 100, 
              height: 22, 
              marginBottom: 12,
              backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
            }]} />
            {Array(5).fill(null).map((_, index) => (
              <View key={index} style={[styles.skeletonLine, { 
                width: `${95 - index * 8}%`, 
                height: 18, 
                marginBottom: 8,
                backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'
              }]} />
            ))}
          </View>

          {/* Action Buttons Skeleton */}
          <View style={styles.actionsSectionSkeleton}>
            <View style={[styles.actionButtonSkeleton, {
              backgroundColor: colorScheme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'
            }]} />
            <View style={[styles.actionButtonSkeleton, {
              backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              marginLeft: 16
            }]} />
          </View>

          {/* Episodes Section Skeleton */}
          <View style={styles.episodesSectionSkeleton}>
            <View style={[styles.skeletonLine, { 
              width: 140, 
              height: 22, 
              marginBottom: 15,
              backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
            }]} />
            {Array(6).fill(null).map((_, index) => (
              <View key={index} style={[styles.episodeItemSkeleton, {
                backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                borderColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
              }]}>
                {/* Episode thumbnail */}
                <View style={[styles.episodeThumbnailSkeleton, {
                  backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                }]}>
                  <View style={[styles.episodePlayIconSkeleton, {
                    backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                  }]} />
                </View>
                
                {/* Episode info */}
                <View style={styles.episodeInfoSkeleton}>
                  <View style={[styles.skeletonLine, { 
                    width: '80%', 
                    height: 18, 
                    marginBottom: 6,
                    backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
                  }]} />
                  <View style={[styles.skeletonLine, { 
                    width: '60%', 
                    height: 16, 
                    marginBottom: 4,
                    backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'
                  }]} />
                  <View style={[styles.skeletonLine, { 
                    width: '40%', 
                    height: 14,
                    backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                  }]} />
                </View>
                
                {/* Episode status */}
                <View style={styles.episodeStatusSkeleton}>
                  <View style={[styles.skeletonLine, { 
                    width: 24, 
                    height: 24, 
                    borderRadius: 12,
                    backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                  }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  if (loading || !anime) {
    return renderLoadingSkeleton();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView 
        style={styles.scrollView}
        bounces={false}
        overScrollMode="never"
      >
        {/* Header avec image de bannière */}
        <View style={styles.header}>
          <Image
            source={{ uri: anime.banner || anime.thumbnail }}
            style={styles.bannerImage}
          />
          {/* <View style={[styles.overlay, { backgroundColor: `${colors.background}CC` }]} /> */}
          
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: `${colors.surface}DD` }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.watchlistButton, { backgroundColor: `${colors.surface}DD` }]}
            onPress={toggleWatchlist}
          >
            <Ionicons
              name={isInWatchlist ? "heart" : "heart-outline"}
              size={24}
              color={isInWatchlist ? colors.error : colors.text}
            />
          </TouchableOpacity>
        </View>

        {/* Informations principales */}
        <View style={styles.mainInfo}>
          <View style={styles.posterSection}>
            <Image
              source={{ uri: anime.thumbnail }}
              style={styles.posterImage}
            />
            
            <View style={styles.infoSection}>
              <Text style={[styles.title, { color: colors.text }]}>{anime.title}</Text>
              
              <View style={styles.metadata}>
                <View style={styles.metadataItem}>
                  <Ionicons name="star" size={16} color="#fbbf24" />
                  <Text style={[styles.rating, { color: colors.text }]}>
                    {anime.rating.toFixed(1)}
                  </Text>
                </View>
                
                {anime.year > 0 && (
                  <View style={styles.metadataItem}>
                    <Ionicons name="calendar" size={16} color={colors.textSecondary} />
                    <Text style={[styles.year, { color: colors.textSecondary }]}>
                      {anime.year}
                    </Text>
                  </View>
                )}
                
                <View style={styles.metadataItem}>
                  <Ionicons name="tv" size={16} color={colors.textSecondary} />
                  <Text style={[styles.episodes, { color: colors.textSecondary }]}>
                    {anime.episodeCount} épisodes
                  </Text>
                </View>
              </View>

              <View style={styles.studio}>
                <Text style={[styles.studioLabel, { color: colors.textSecondary }]}>Studio:</Text>
                <Text style={[styles.studioName, { color: colors.text }]}>{anime.studio}</Text>
              </View>
            </View>
          </View>

          {/* Genres */}
          <View style={styles.genresSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Genres</Text>
            <View style={styles.genresContainer}>
              {anime.genres.map(renderGenre)}
            </View>
          </View>

          {/* Synopsis */}
          <View style={styles.synopsisSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Synopsis</Text>
            <Text style={[styles.synopsis, { color: colors.textSecondary }]}>
              {anime.synopsis}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={() => episodes.length > 0 && playEpisode(episodes[0])}
            >
              <Ionicons name="play" size={24} color={colors.background} />
              <Text style={[styles.actionButtonText, { color: colors.background }]}>
                Regarder
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton, { borderColor: colors.border }]}
              onPress={toggleWatchlist}
            >
              <Ionicons
                name={isInWatchlist ? "heart" : "heart-outline"}
                size={24}
                color={colors.text}
              />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>
                {isInWatchlist ? 'Retirer' : 'Ajouter'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Liste des épisodes */}
          <View style={styles.episodesSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Épisodes ({episodes.length})
            </Text>
            <FlatList
              data={episodes}
              renderItem={renderEpisode}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  header: {
    height: 250,
    position: 'relative',
  },
  bannerImage: {
    // width: '100%',
    height: '100%',
    // marginLeft: '-50%',
  
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchlistButton: {
    position: 'absolute',
    top: 40,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainInfo: {
    padding: 16,
    marginTop: -50,
  },
  posterSection: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  posterImage: {
    width: 120,
    height: 180,
    borderRadius: 12,
    marginRight: 16,
  },
  infoSection: {
    flex: 1,
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  metadata: {
    marginBottom: 12,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rating: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
  year: {
    fontSize: 14,
    marginLeft: 6,
  },
  episodes: {
    fontSize: 14,
    marginLeft: 6,
  },
  studio: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studioLabel: {
    fontSize: 14,
    marginRight: 6,
  },
  studioName: {
    fontSize: 14,
    fontWeight: '600',
  },
  genresSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  genreTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  genreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  synopsisSection: {
    marginBottom: 24,
  },
  synopsis: {
    fontSize: 16,
    lineHeight: 24,
  },
  actionsSection: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    marginRight: 0,
    marginLeft: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  episodesSection: {
    marginBottom: 24,
  },
  episodeItem: {
    flexDirection: 'row',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden', // Pour que le thumbnail puisse toucher les bords
  },
  episodeMainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 'auto',
    marginLeft: 0,
    marginRight: 4,
  },
  episodeThumbnail: {
    width: 110,
    height: 86, // Ajusté pour correspondre à la hauteur totale du container
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    marginRight: 12,
  },
  episodeInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 2, // Récupérer le padding vertical qui était dans episodeItem
  },
  episodeTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeNumber: {
    fontSize: 14,
    marginBottom: 2,
  },
  episodeDuration: {
    fontSize: 12,
  },
  episodeStatus: {
    alignItems: 'center',
    justifyContent: 'center',
    width:35,
    paddingVertical: 'auto', // Même padding que episodeInfo pour l'alignement
  },
  progressBar: {
    width: 30,
    height: 3,
    borderRadius: 1.5,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  // Styles pour les squelettes
  skeletonText: {
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
  },
  skeletonLine: {
    borderRadius: 6,
    opacity: 0.7,
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Nouveaux styles pour le skeleton moderne
  bannerSkeleton: {
    width: '100%',
    height: '100%',
    position: 'relative',
    borderRadius: 0,
  },
  backButtonSkeleton: {
    position: 'absolute',
    top: 40,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  watchlistButtonSkeleton: {
    position: 'absolute',
    top: 40,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  mainInfoSkeleton: {
    padding: 16,
    marginTop: -50,
  },
  posterSectionSkeleton: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  posterSkeleton: {
    width: 120,
    height: 180,
    borderRadius: 12,
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterIconSkeleton: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  infoSectionSkeleton: {
    flex: 1,
    paddingTop: 40,
  },
  metadataSkeleton: {
    marginBottom: 12,
  },
  genresSectionSkeleton: {
    marginBottom: 24,
  },
  genresRowSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  genreTagSkeleton: {
    width: 70,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  synopsisSectionSkeleton: {
    marginBottom: 24,
  },
  actionsSectionSkeleton: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  actionButtonSkeleton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    marginRight: 8,
  },
  episodesSectionSkeleton: {
    marginBottom: 24,
  },
  episodeItemSkeleton: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  episodeThumbnailSkeleton: {
    width: 80,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodePlayIconSkeleton: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  episodeInfoSkeleton: {
    flex: 1,
    justifyContent: 'center',
  },
  episodeStatusSkeleton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
  },
});

export default AnimeDetailScreen; 