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
import { Anime, Episode } from '../../types/anime';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
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
      primary: '#6366f1',
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
      primary: '#818cf8',
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

      try {
        // Essayer d'abord de charger les épisodes (cela fonctionne)
        animeEpisodes = await apiService.getAnimeEpisodes(animeId);
        console.log(`[AnimeDetail] ${animeEpisodes.length} épisodes chargés`);

        // Si on a des épisodes, on peut créer les détails basiques de l'anime
        if (animeEpisodes.length > 0 && animeEpisodes[0].animeTitle) {
          animeDetails = {
            id: animeId,
            title: animeEpisodes[0].animeTitle,
            originalTitle: animeEpisodes[0].animeTitle,
            synopsis: 'Synopsis non disponible via l\'API',
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

      // Si on n'a pas réussi à avoir les détails via les épisodes, essayer l'API directe
      if (!animeDetails) {
        try {
          animeDetails = await apiService.getAnimeDetails(animeId);
          console.log('[AnimeDetail] Détails anime chargés via API:', animeDetails.title);
        } catch (apiError) {
          console.warn('[AnimeDetail] API détails non disponible:', apiError);
          
          // Fallback final : créer un anime basique
          animeDetails = {
            id: animeId,
            title: `Anime ${animeId}`,
            originalTitle: `Anime ${animeId}`,
            synopsis: 'Les détails de cet anime ne sont pas disponibles pour le moment.',
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
          console.log('[AnimeDetail] Utilisation des détails fallback');
        }
      }

      setAnime(animeDetails);
      setEpisodes(animeEpisodes);

      // Sauvegarder en base locale
      if (animeDetails) {
        await databaseService.saveAnime(animeDetails);
      }
      
      for (const episode of animeEpisodes) {
        await databaseService.saveEpisode(episode);
      }
      
    } catch (error) {
      console.error('Erreur lors du chargement des détails:', error);
      Alert.alert(
        'Erreur', 
        'Impossible de charger les détails de l\'animé. L\'API semble avoir un problème.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
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

  const renderEpisode = ({ item: episode }: { item: Episode }) => (
    <TouchableOpacity
      style={[styles.episodeItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => playEpisode(episode)}
    >
      <Image
        source={{ uri: episode.thumbnail }}
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
        {/* Header Skeleton */}
        <View style={styles.header}>
          <SkeletonCard type="anime" size="large" />
        </View>

        {/* Info Section Skeleton */}
        <View style={styles.infoSection}>
          <View style={[styles.skeletonText, { height: 20, width: '60%', marginBottom: 10 }]} />
          <View style={[styles.skeletonText, { height: 16, width: '40%', marginBottom: 15 }]} />
          <View style={styles.genreRow}>
            {Array(3).fill(null).map((_, index) => (
              <View key={index} style={[styles.skeletonText, { height: 25, width: 80, marginRight: 8, borderRadius: 12 }]} />
            ))}
          </View>
        </View>

        {/* Synopsis Skeleton */}
        <View style={styles.synopsisSection}>
          <View style={[styles.skeletonText, { height: 20, width: '30%', marginBottom: 10 }]} />
          {Array(4).fill(null).map((_, index) => (
            <View key={index} style={[styles.skeletonText, { height: 16, width: `${90 - index * 10}%`, marginBottom: 8 }]} />
          ))}
        </View>

        {/* Episodes Skeleton */}
        <View style={styles.episodesSection}>
          <View style={[styles.skeletonText, { height: 20, width: '25%', marginBottom: 15 }]} />
          {Array(6).fill(null).map((_, index) => (
            <SkeletonCard key={index} type="episode" size="medium" />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  if (loading || !anime) {
    return renderLoadingSkeleton();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar backgroundColor={colors.background} barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      <ScrollView style={styles.scrollView}>
        {/* Header avec image de bannière */}
        <View style={styles.header}>
          <Image
            source={{ uri: anime.banner || anime.thumbnail }}
            style={styles.bannerImage}
          />
          <View style={[styles.overlay, { backgroundColor: `${colors.background}CC` }]} />
          
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
                
                <View style={styles.metadataItem}>
                  <Ionicons name="calendar" size={16} color={colors.textSecondary} />
                  <Text style={[styles.year, { color: colors.textSecondary }]}>
                    {anime.year}
                  </Text>
                </View>
                
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
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
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
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  episodeThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  episodeInfo: {
    flex: 1,
    justifyContent: 'center',
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
    width: 40,
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
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

export default AnimeDetailScreen; 