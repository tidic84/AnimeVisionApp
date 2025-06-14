import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  useColorScheme,
  RefreshControl,

  Dimensions,
  ImageBackground,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Episode, Anime } from '../../types/anime';
import hybridScrapingService from '../../services/hybridScrapingService';
import databaseService from '../../services/databaseService';
import SkeletonCardComponent from '../../components/SkeletonCard/SkeletonCard';
import EpisodeCard from '../../components/EpisodeCard/EpisodeCard';
import AnimeCard from '../../components/AnimeCard/AnimeCard';
import ApiGuard from '../../components/ApiGuard';

// Composant de message d'erreur simple
const ErrorMessage: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => {
  const colorScheme = useColorScheme();
  const colors = {
    light: { background: '#ffffff', text: '#1e293b', primary: '#6366f1', surface: '#f8fafc' },
    dark: { background: '#0f172a', text: '#f1f5f9', primary: '#818cf8', surface: '#1e293b' },
  }[colorScheme ?? 'light'];

  return (
    <View style={[styles.errorContainer, { backgroundColor: colors.surface }]}>
      <Text style={[styles.errorText, { color: colors.text }]}>{message}</Text>
      <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Réessayer</Text>
      </TouchableOpacity>
    </View>
  );
};

// Composant de skeleton simple
const SkeletonCard: React.FC<{ width: number; height: number; style?: any }> = ({ width, height, style }) => {
  const colorScheme = useColorScheme();
  
  return (
    <View 
      style={[
        { 
          width, 
          height, 
          backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f1f5f9',
          borderRadius: 12,
          marginRight: 12,
        }, 
        style
      ]} 
    />
  );
};

// Composant de skeleton pour le texte
const SkeletonText: React.FC<{ width: string | number; height: number; style?: any }> = ({ width, height, style }) => {
  const colorScheme = useColorScheme();
  
  return (
    <View 
      style={[
        { 
          width, 
          height, 
          backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderRadius: 4,
          marginBottom: 8,
        }, 
        style
      ]} 
    />
  );
};

const HomeScreen: React.FC = () => {
  return (
    <ApiGuard fallbackMessage="L'accueil nécessite une connexion à l'API pour afficher les derniers épisodes et recommandations.">
      <HomeScreenContent />
    </ApiGuard>
  );
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const HomeScreenContent: React.FC = () => {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const [latestEpisodes, setLatestEpisodes] = useState<Episode[]>([]);
  const [continueWatching, setContinueWatching] = useState<Episode[]>([]);
  const [recommendedAnimes, setRecommendedAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);
  const [loadingAnimes, setLoadingAnimes] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  
  // États d'erreur séparés pour chaque section
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [animesError, setAnimesError] = useState<string | null>(null);

  const colors = {
    light: {
      background: '#ffffff',
      text: '#1e293b',
      textSecondary: '#64748b',
      surface: '#f8fafc',
      border: '#e2e8f0',
      primary: '#6366f1',
    },
    dark: {
      background: '#0f172a',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      surface: '#1e293b',
      border: '#334155',
      primary: '#818cf8',
    },
  }[colorScheme ?? 'light'];

  // Chargement initial seulement
  useEffect(() => {
    if (!hasLoadedOnce) {
      loadHomeData();
    }
  }, [hasLoadedOnce]);

  // Navigation focus - chargement intelligent
  useFocusEffect(
    React.useCallback(() => {
      const checkAndLoadIfNeeded = async () => {
        // Si c'est la première fois qu'on charge, ne rien faire (déjà géré par useEffect)
        if (!hasLoadedOnce) return;

        // Vérifier si on a un cache complet et valide
        const hasCompleteCache = await hybridScrapingService.hasCompleteHomeCache();
        const hasData = latestEpisodes.length > 0 && recommendedAnimes.length > 0;
        
        if (hasCompleteCache && hasData) {
          console.log('[HomeScreen] Cache complet et données présentes - pas de rechargement');
          // Actualiser seulement la section "Continuer à regarder" depuis la DB
          updateContinueWatching();
          return;
        }
        
        // Vérifier l'âge du cache
        const cacheAge = hybridScrapingService.getCacheAge();
        const isRecentCache = (cacheAge.latestEpisodes && cacheAge.latestEpisodes < 30) ||
                             (cacheAge.popularAnimes && cacheAge.popularAnimes < 60);
        
        if (hasData && isRecentCache) {
          console.log(`[HomeScreen] Cache récent (épisodes: ${cacheAge.latestEpisodes}min, animés: ${cacheAge.popularAnimes}min) - pas de rechargement`);
          updateContinueWatching();
          return;
        }
        
        // Ne recharger que si vraiment nécessaire
        if (!hasData) {
          console.log('[HomeScreen] Rechargement nécessaire - pas de données');
          loadHomeData();
        } else {
          console.log('[HomeScreen] Données présentes mais cache ancien - actualisation silencieuse');
          updateContinueWatching();
        }
      };

      checkAndLoadIfNeeded();
    }, [hasLoadedOnce, latestEpisodes.length, recommendedAnimes.length])
  );

  const updateContinueWatching = async () => {
    try {
      if (latestEpisodes.length > 0) {
        const watchHistory = await databaseService.getWatchHistory();
        const continueEpisodes = latestEpisodes.filter(ep => 
          watchHistory.some(history => 
            history.episodeId === ep.id && history.progress > 10 && history.progress < 90
          )
        );
        setContinueWatching(continueEpisodes.slice(0, 5));
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour de "Continuer à regarder":', error);
    }
  };

  const loadHomeData = async () => {
    try {
      setLoading(true);
      setLoadingEpisodes(true);
      setLoadingAnimes(true);
      setEpisodesError(null);
      setAnimesError(null);
      
      console.log('[HomeScreen] Début du chargement des données...');
      
      // Vérifier le cache avant tout
      const cacheStats = hybridScrapingService.getCacheStats?.() || { memoryEntries: 0 };
      const hasValidCache = cacheStats.memoryEntries > 0;
      
      console.log(`[Cache] ${hasValidCache ? 'PRÉSENT' : 'ABSENT'} (${cacheStats.memoryEntries} entrées)`);
      
      // Délai minimum seulement pour la première visite ET sans cache
      const shouldShowSkeleton = !hasLoadedOnce && !hasValidCache;
      const minLoadingTime = shouldShowSkeleton ? 
        new Promise(resolve => setTimeout(resolve, 800)) : 
        Promise.resolve();
      
      // Charger les derniers épisodes
      const episodesPromise = hybridScrapingService.getLatestEpisodes()
        .then((episodes: Episode[]) => {
          setLatestEpisodes(episodes);
          setEpisodesError(null);
          setLoadingEpisodes(false);
          console.log(`[Episodes] ${episodes.length} épisodes chargés ${hasValidCache ? '(cache)' : '(réseau)'}`);
          return episodes;
        })
        .catch((error: any) => {
          console.error('Erreur lors du chargement des épisodes:', error);
          setEpisodesError(error.message);
          setLatestEpisodes([]);
          setLoadingEpisodes(false);
          return [];
        });
      
      // Charger les animés classiques
      const animesPromise = hybridScrapingService.getPopularAnimes()
        .then((animes: Anime[]) => {
          setRecommendedAnimes(animes.slice(0, 10));
          setAnimesError(null);
          setLoadingAnimes(false);
          console.log(`[Animés] ${animes.length} animés chargés ${hasValidCache ? '(cache)' : '(réseau)'}`);
          return animes;
        })
        .catch((error: any) => {
          console.error('Erreur lors du chargement des animés:', error);
          setAnimesError(error.message);
          setRecommendedAnimes([]);
          setLoadingAnimes(false);
          return [];
        });
      
      // Attendre toutes les promesses
      const [episodes] = await Promise.all([
        episodesPromise,
        animesPromise,
        minLoadingTime
      ]);

      // Mettre à jour la section "Continuer à regarder" depuis la DB
      if (episodes.length > 0) {
        updateContinueWatching();
      }

      console.log('[HomeScreen] Chargement terminé avec succès');
      setLoading(false);
      setHasLoadedOnce(true);

    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      setLoading(false);
      setLoadingEpisodes(false);
      setLoadingAnimes(false);
      setEpisodesError('Erreur de chargement des données');
      setAnimesError('Erreur de chargement des données');
    }
  };

  const onRefresh = () => {
    console.log('[Pull-to-Refresh] Début du refresh...');
    setIsRefreshing(true);
    
    // Utiliser la méthode forceRefresh pour vider complètement le cache et recharger
    hybridScrapingService.forceRefresh()
      .then(({ latestEpisodes, popularAnimes }: { latestEpisodes: Episode[], popularAnimes: Anime[] }) => {
        setLatestEpisodes(latestEpisodes);
        setRecommendedAnimes(popularAnimes.slice(0, 10));
        setEpisodesError(null);
        setAnimesError(null);
        console.log(`[Pull-to-Refresh SUCCESS] Cache vidé - ${latestEpisodes.length} épisodes et ${popularAnimes.length} animés rechargés avec nouvelles images`);
      })
      .catch((error: any) => {
        console.error('Erreur lors du pull-to-refresh:', error);
        // Essayer de recharger normalement en cas d'erreur du force refresh
        loadHomeData();
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  };

  const retryLoadEpisodes = () => {
    console.log('[HomeScreen] Nouvelle tentative de chargement des épisodes...');
    setLoadingEpisodes(true);
    setEpisodesError(null);
    
    hybridScrapingService.getLatestEpisodes()
      .then((episodes: Episode[]) => {
        setLatestEpisodes(episodes);
        setEpisodesError(null);
      })
      .catch((error: any) => {
        setEpisodesError(error.message);
      })
      .finally(() => {
        setLoadingEpisodes(false);
      });
  };

  const retryLoadAnimes = () => {
    console.log('[HomeScreen] Nouvelle tentative de chargement des animés...');
    setLoadingAnimes(true);
    setAnimesError(null);
    
    hybridScrapingService.getPopularAnimes()
      .then((animes: Anime[]) => {
        setRecommendedAnimes(animes.slice(0, 10));
        setAnimesError(null);
        console.log(`[Animés RETRY] ${animes.length} animés chargés avec succès`);
      })
      .catch((error: any) => {
        console.error('Erreur lors du rechargement des animés:', error);
        setAnimesError(error.message);
        setRecommendedAnimes([]);
      })
      .finally(() => {
        setLoadingAnimes(false);
      });
  };

  const playEpisode = (episode: Episode) => {
    console.log('[HomeScreen] Navigation vers VideoPlayer pour:', episode.title);
    console.log('[HomeScreen] AnimeId:', episode.animeId, 'EpisodeId:', episode.id);
    (navigation as any).navigate('VideoPlayer', { 
      episodeId: episode.id, 
      animeId: episode.animeId,
      autoPlay: true 
    });
  };

  const navigateToAnimeDetail = (animeId: string) => {
    console.log('[HomeScreen] Navigation vers AnimeDetail pour:', animeId);
    (navigation as any).navigate('AnimeDetail', { animeId });
  };

  const renderEpisodeCard = ({ item: episode }: { item: Episode }) => (
    <EpisodeCard
      episode={episode}
      onPress={playEpisode}
      size="medium"
      showProgress={true}
    />
  );

  const renderAnimeCard = ({ item: anime }: { item: Anime }) => (
    <AnimeCard
      anime={anime}
      onPress={navigateToAnimeDetail}
      size="medium"
    />
  );

  const renderEpisodeSkeleton = () => (
    <View style={styles.episodeSkeletonCard}>
      {/* Image/Thumbnail placeholder */}
      <View style={[styles.episodeSkeletonThumbnail, {
        backgroundColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0'
      }]}>
        <View style={[styles.episodeSkeletonPlayIcon, {
          backgroundColor: colorScheme === 'dark' ? '#475569' : '#cbd5e1'
        }]} />
      </View>
      
      {/* Contenu */}
      <View style={styles.episodeSkeletonContent}>
        {/* Titre anime */}
        <SkeletonText width="85%" height={16} style={{ marginBottom: 6 }} />
        {/* Titre épisode */}
        <SkeletonText width="70%" height={14} style={{ marginBottom: 6 }} />
        {/* Durée */}
        <SkeletonText width="40%" height={12} style={{ marginBottom: 0 }} />
      </View>
    </View>
  );

  const renderAnimeSkeleton = () => (
    <View style={styles.animeSkeletonCard}>
      {/* Poster placeholder */}
      <View style={[styles.animeSkeletonPoster, {
        backgroundColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0'
      }]}>
        <View style={[styles.animeSkeletonIcon, {
          backgroundColor: colorScheme === 'dark' ? '#475569' : '#cbd5e1'
        }]} />
      </View>
      
      {/* Titre */}
      <SkeletonText width="90%" height={16} style={{ marginTop: 8, marginBottom: 4 }} />
      {/* Sous-titre */}
      <SkeletonText width="70%" height={14} style={{ marginBottom: 8 }} />
      
      {/* Métadonnées */}
      <View style={styles.animeSkeletonMeta}>
        <SkeletonText width={35} height={12} style={{ marginRight: 8, marginBottom: 0 }} />
        <SkeletonText width={25} height={12} style={{ marginBottom: 0 }} />
      </View>
    </View>
  );

  const renderSkeletonList = (count: number, type: 'anime' | 'episode') => (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={Array(count).fill(null)}
      renderItem={type === 'episode' ? renderEpisodeSkeleton : renderAnimeSkeleton}
      keyExtractor={(_, index) => index.toString()}
      contentContainerStyle={styles.horizontalList}
    />
  );

  // Carousel simple sans animations complexes
  const renderCarouselItem = ({ item: anime }: { item: Anime }) => (
    <TouchableOpacity
      style={styles.carouselItem}
      onPress={() => navigateToAnimeDetail(anime.id)}
      activeOpacity={1}
    >
      <ImageBackground
        source={{ uri: anime.thumbnail }}
        style={styles.carouselBackground}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.5)', 'rgba(255,255,255,1)']}
          locations={[0, 0.7, 1]}
          style={styles.carouselGradient}
        >
          <View style={styles.carouselContent}>
            <View style={styles.carouselInfo}>
              <Text style={styles.carouselTitle} numberOfLines={2}>
                {anime.title}
              </Text>
              <Text style={styles.carouselDescription} numberOfLines={3}>
                {anime.synopsis}
              </Text>
              <View style={styles.carouselMetadata}>
                <View style={styles.carouselRating}>
                  <Ionicons name="star" size={16} color="#fbbf24" />
                  <Text style={styles.carouselRatingText}>
                    {anime.rating.toFixed(1)}
                  </Text>
                </View>
                <Text style={styles.carouselYear}>{anime.year}</Text>
                <Text style={styles.carouselGenres}>
                  {anime.genres.slice(0, 2).join(' • ')}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.playButton}
              onPress={() => navigateToAnimeDetail(anime.id)}
            >
              <Ionicons name="play" size={24} color="#ffffff" />
              <Text style={styles.playButtonText}>REGARDER</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </ImageBackground>
    </TouchableOpacity>
  );

  const renderCarouselSkeleton = () => (
    <View style={styles.carouselItem}>
      <View style={[styles.carouselBackground, { backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f1f5f9' }]}>
        <View style={styles.carouselGradient}>
          <View style={styles.carouselContent}>
            <View style={styles.carouselInfo}>
              <SkeletonText width="80%" height={24} style={{ marginBottom: 8 }} />
              <SkeletonText width="100%" height={16} style={{ marginBottom: 4 }} />
              <SkeletonText width="90%" height={16} style={{ marginBottom: 4 }} />
              <SkeletonText width="70%" height={16} style={{ marginBottom: 16 }} />
              <SkeletonText width="60%" height={14} style={{ marginBottom: 0 }} />
            </View>
            <View style={[styles.playButton, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
              <SkeletonText width={80} height={20} style={{ marginBottom: 0 }} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" translucent />
      <ScrollView
        style={styles.scrollView}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl 
            refreshing={isRefreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Carousel Principal - Simple */}
        <View style={styles.carouselContainer}>
          {loadingAnimes ? (
            renderCarouselSkeleton()
          ) : animesError ? (
            <View style={styles.carouselItem}>
              <View style={[styles.carouselBackground, { backgroundColor: colors.surface }]}>
                <View style={styles.carouselGradient}>
                  <ErrorMessage 
                    message={animesError} 
                    onRetry={retryLoadAnimes}
                  />
                </View>
              </View>
            </View>
          ) : (
            <FlatList
              data={recommendedAnimes.slice(0, 5)}
              renderItem={renderCarouselItem}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
                setCurrentCarouselIndex(index);
              }}
            />
          )}
          
          {/* Indicateurs de pagination simples */}
          {!loadingAnimes && !animesError && recommendedAnimes.length > 0 && (
            <View style={styles.pagination}>
              {recommendedAnimes.slice(0, 5).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.paginationDot,
                    {
                      backgroundColor: index === currentCarouselIndex ? 
                        (colorScheme === 'dark' ? '#ffffff' : '#1e293b') :
                        (colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(30, 41, 59, 0.4)'),
                    }
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Section Continuer à regarder */}
        {continueWatching.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Continuer à regarder
              </Text>
            </View>
            <FlatList
              data={continueWatching}
              renderItem={renderEpisodeCard}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {/* Section Derniers épisodes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Derniers épisodes
            </Text>
            {!loadingEpisodes && !episodesError && latestEpisodes.length > 0 && (
              <TouchableOpacity onPress={() => (navigation as any).navigate('Catalog')}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>
                  Voir tout
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingEpisodes ? (
            renderSkeletonList(5, 'episode')
          ) : episodesError ? (
            <ErrorMessage 
              message={episodesError} 
              onRetry={retryLoadEpisodes}
            />
          ) : latestEpisodes.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Aucun épisode disponible
              </Text>
            </View>
          ) : (
            <FlatList
              data={latestEpisodes.slice(0, 10)}
              renderItem={renderEpisodeCard}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          )}
        </View>

        {/* Section Recommandations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Recommandations
            </Text>
            {!loadingAnimes && !animesError && recommendedAnimes.length > 0 && (
              <TouchableOpacity onPress={() => (navigation as any).navigate('Catalog')}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>
                  Voir tout
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingAnimes ? (
            renderSkeletonList(5, 'anime')
          ) : animesError ? (
            <ErrorMessage 
              message={animesError} 
              onRetry={retryLoadAnimes}
            />
          ) : recommendedAnimes.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Aucune recommandation disponible
              </Text>
            </View>
          ) : (
            <FlatList
              data={recommendedAnimes.slice(5, 10)}
              renderItem={renderAnimeCard}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 16,
  },
  infoButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  infoButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Styles du caroussel
  carouselContainer: {
    position: 'relative',
    marginBottom: 0,
  },
  carouselItem: {
    width: screenWidth,
    height: screenHeight * 0.85,
  },
  carouselBackground: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  carouselGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  carouselContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  carouselInfo: {
    marginBottom: 20,
  },
  carouselTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  carouselDescription: {
    fontSize: 16,
    color: '#ffffff',
    lineHeight: 22,
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  carouselMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  carouselRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  carouselRatingText: {
    fontSize: 14,
    color: '#ffffff',
    marginLeft: 4,
    fontWeight: '600',
  },
  carouselYear: {
    fontSize: 14,
    color: '#ffffff',
    marginRight: 12,
    fontWeight: '500',
  },
  carouselGenres: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  playButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  pagination: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  skeletonText: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  retryIconButton: {
    padding: 4,
  },
  horizontalList: {
    paddingHorizontal: 16,
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  stackCard: {
    width: screenWidth * 0.7,
    height: screenHeight * 0.85,
    marginRight: 12,
  },
  stackCardTouchable: {
    flex: 1,
  },
  stackContainer: {
    alignItems: 'center',
    paddingHorizontal: screenWidth * 0.15,
  },
  stackCardWrapper: {
    width: screenWidth,
    height: screenHeight * 0.85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeSkeletonCard: {
    width: screenWidth * 0.7,
    height: screenHeight * 0.85,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  episodeSkeletonThumbnail: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  episodeSkeletonPlayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    position: 'absolute',
    top: 10,
    left: 10,
  },
  episodeSkeletonContent: {
    padding: 10,
  },
  animeSkeletonCard: {
    width: screenWidth * 0.7,
    height: screenHeight * 0.85,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  animeSkeletonPoster: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  animeSkeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    position: 'absolute',
    top: 10,
    left: 10,
  },
  animeSkeletonMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptySection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default HomeScreen; 

