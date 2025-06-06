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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Episode, Anime } from '../../types/anime';
import hybridScrapingService from '../../services/hybridScrapingService';
import databaseService from '../../services/databaseService';

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
  const skeletonColors = {
    light: { border: '#e2e8f0' },
    dark: { border: '#334155' },
  }[colorScheme ?? 'light'];

  return (
    <View 
      style={[
        { 
          width, 
          height, 
          backgroundColor: skeletonColors.border,
          borderRadius: 12,
          marginRight: 12,
        }, 
        style
      ]} 
    />
  );
};

const HomeScreen: React.FC = () => {
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

  const showScrapingLimitation = () => {
    Alert.alert(
      "🔍 Contenu Dynamique Détecté",
      "Anime-sama.fr utilise du JavaScript pour charger le contenu dynamiquement. Seuls 1-2 éléments par section sont récupérés avec l'approche actuelle.\n\nSolution recommandée : Serveur de scraping avec Puppeteer (voir SOLUTION-CONTENU-DYNAMIQUE.md)",
      [
        { text: "Compris", style: "default" },
        { 
          text: "Voir Documentation", 
          onPress: () => console.log("Consultez SOLUTION-CONTENU-DYNAMIQUE.md pour les détails complets")
        }
      ]
    );
  };

  const showServiceDiagnostic = async () => {
    try {
      const status = await hybridScrapingService.getServiceStatus();
      const apiCacheStats = await hybridScrapingService.getApiCacheStats();
      
      const message = `
🔧 État du Service de Scraping:

🌐 Serveur API: ${status.apiServer ? '✅ DISPONIBLE' : '❌ INDISPONIBLE'}
🔄 Fallback Local: ${status.fallback ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}
📍 Source Actuelle: ${status.currentSource.toUpperCase()}

📊 Cache Serveur API:
${apiCacheStats.keys ? `- ${apiCacheStats.keys.length} entrées` : '- Aucune donnée'}

💡 Le serveur API utilise Puppeteer pour un scraping complet du contenu dynamique, tandis que le fallback utilise l'ancien système limité.
      `.trim();

      Alert.alert(
        "🔍 Diagnostic du Service",
        message,
        [
          { text: "Fermer", style: "default" },
          { 
            text: "Redémarrer Serveur", 
            onPress: () => {
              console.log("Pour redémarrer le serveur: cd ../anime-scraping-server && npm run dev");
              Alert.alert("Info", "Consultez les logs pour redémarrer le serveur de scraping");
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert("Erreur", "Impossible de récupérer l'état du service");
    }
  };

  const playEpisode = (episode: Episode) => {
    console.log('[HomeScreen] Navigation vers VideoPlayer pour:', episode.title);
    (navigation as any).navigate('VideoPlayer', { episode });
  };

  const navigateToAnimeDetail = (animeId: string) => {
    console.log('[HomeScreen] Navigation vers AnimeDetail pour:', animeId);
    (navigation as any).navigate('AnimeDetail', { animeId });
  };

  const renderEpisodeCard = ({ item: episode }: { item: Episode }) => (
    <TouchableOpacity
      style={[styles.episodeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => playEpisode(episode)}
    >
      <View style={styles.episodeImageContainer}>
        <View style={[styles.episodePlaceholder, { backgroundColor: colors.border }]}>
          <Ionicons name="play-circle" size={32} color={colors.primary} />
        </View>
      </View>
      <View style={styles.episodeInfo}>
        <Text style={[styles.episodeTitle, { color: colors.text }]} numberOfLines={2}>
          {episode.title}
        </Text>
        <Text style={[styles.episodeSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          Épisode {episode.number} • {Math.floor(episode.duration / 60)} min
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderAnimeCard = ({ item: anime }: { item: Anime }) => (
    <TouchableOpacity
      style={[styles.animeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => navigateToAnimeDetail(anime.id)}
    >
      <View style={styles.animeImageContainer}>
        <View style={[styles.animePlaceholder, { backgroundColor: colors.border }]}>
          <Ionicons name="film" size={24} color={colors.primary} />
        </View>
      </View>
      <Text style={[styles.animeTitle, { color: colors.text }]} numberOfLines={2}>
        {anime.title}
      </Text>
      <View style={styles.animeGenres}>
        {anime.genres.slice(0, 2).map((genre, index) => (
          <View key={index} style={[styles.genreTag, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.genreText, { color: colors.primary }]}>{genre}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );

  const renderEpisodeSkeleton = () => (
    <SkeletonCard width={160} height={120} style={styles.episodeCard} />
  );

  const renderAnimeSkeleton = () => (
    <SkeletonCard width={140} height={180} style={styles.animeCard} />
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl 
            refreshing={isRefreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.welcomeText, { color: colors.text }]}>
            Bonjour ! 👋
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Données en direct d'anime-sama.fr
          </Text>
          
          <View style={styles.buttonRow}>
            {/* Bouton d'information sur les limitations */}
            <TouchableOpacity 
              style={[styles.infoButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={showScrapingLimitation}
            >
              <View style={styles.infoButtonContent}>
                <Ionicons name="information-circle" size={16} color={colors.primary} />
                <Text style={[styles.infoButtonText, { color: colors.primary }]}>
                  Limitation du scraping
                </Text>
              </View>
            </TouchableOpacity>

            {/* Bouton de diagnostic du service */}
            <TouchableOpacity 
              style={[styles.infoButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={showServiceDiagnostic}
            >
              <View style={styles.infoButtonContent}>
                <Ionicons name="analytics" size={16} color={colors.primary} />
                <Text style={[styles.infoButtonText, { color: colors.primary }]}>
                  Diagnostic
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section Continuer à regarder */}
        {continueWatching.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Continuer à regarder
            </Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={continueWatching}
              renderItem={renderEpisodeCard}
              keyExtractor={item => item.id}
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
            {episodesError && (
              <TouchableOpacity onPress={retryLoadEpisodes} style={styles.retryIconButton}>
                <Ionicons name="refresh" size={20} color={colors.primary} />
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
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={latestEpisodes}
              renderItem={renderEpisodeCard}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.horizontalList}
            />
          )}
        </View>

        {/* Section Animés recommandés */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Animés populaires
            </Text>
            {animesError && (
              <TouchableOpacity onPress={retryLoadAnimes} style={styles.retryIconButton}>
                <Ionicons name="refresh" size={20} color={colors.primary} />
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
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={recommendedAnimes}
              renderItem={renderAnimeCard}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.horizontalList}
            />
          )}
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
  episodeCard: {
    width: 160,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  episodeImageContainer: {
    height: 90,
  },
  episodePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeInfo: {
    padding: 8,
  },
  episodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeSubtitle: {
    fontSize: 12,
  },
  animeCard: {
    width: 140,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  animeImageContainer: {
    height: 120,
  },
  animePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginHorizontal: 8,
  },
  animeGenres: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    gap: 4,
  },
  genreTag: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  genreText: {
    fontSize: 10,
    fontWeight: '500',
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
});

export default HomeScreen; 