import { useAppColorScheme as useColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  Dimensions,
  useWindowDimensions,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MainTabScreenProps } from '../../types/navigation';
import { Anime, AnimeStatus } from '../../types/anime';
import apiService from '../../services/apiService';
import { useApi } from '../../contexts/ApiContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomModal from '../../components/CustomModal';

type CatalogScreenProps = MainTabScreenProps<'Catalog'>;

const { width: screenWidth } = Dimensions.get('window');

const Colors = palette;

const GENRES = [
  'Action', 'Aventure', 'Comédie', 'Drame', 'Fantasy', 'Horreur',
  'Mystère', 'Romance', 'Science-Fiction', 'Slice of Life', 'Sport',
  'Surnaturel', 'Thriller', 'École', 'Magie', 'Mecha', 'Militaire',
  'Musique', 'Psychologique', 'Historique', 'Josei', 'Seinen', 'Shojo', 'Shonen'
];

const YEARS = Array.from({ length: new Date().getFullYear() - 1959 }, (_, i) => new Date().getFullYear() - i);

const SORT_OPTIONS = [
  { key: 'popularity', label: 'Popularité' },
  { key: 'rating', label: 'Note' },
  { key: 'year', label: 'Année' },
  { key: 'title', label: 'Alphabétique' },
  { key: 'newest', label: 'Plus récent' },
];

interface FilterState {
  genres: string[];
  status: AnimeStatus | 'all';
  years: number[];
  studio: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

const CatalogScreen: React.FC<CatalogScreenProps> = ({ navigation }) => {
  const colorScheme = useColorScheme();
  const { width: viewportWidth } = useWindowDimensions();
  const columnCount = viewportWidth > 1100 ? 6 : viewportWidth > 760 ? 4 : viewportWidth > 540 ? 3 : 2;
  const cardWidth = (viewportWidth - 48 - (columnCount - 1) * 14) / columnCount;
  const colors = Colors[colorScheme ?? 'light'];
  const { isApiAvailable } = useApi();
  const insets = useSafeAreaInsets();

  const latestRequest = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availableGenres, setAvailableGenres] = useState(GENRES);
  const [totalItems, setTotalItems] = useState(0);
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageCache, setPageCache] = useState<Map<number, Anime[]>>(new Map());
  const [totalPages, setTotalPages] = useState(1);
  const [isChangingPage, setIsChangingPage] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    genres: [],
    status: 'all',
    years: [],
    studio: '',
    sortBy: 'popularity',
    sortOrder: 'desc',
  });

  useEffect(() => {
    if (!isApiAvailable) return;
    let active = true;
    apiService.getAvailableGenres().then(genres => { if (active && genres.length) setAvailableGenres(genres); });
    return () => { active = false; };
  }, [isApiAvailable]);

  useEffect(() => {
    if (!isApiAvailable) return;
    const timeout = setTimeout(() => { loadAnimes(1, true); }, searchQuery.trim() ? 300 : 0);
    return () => { clearTimeout(timeout); latestRequest.current += 1; };
  }, [isApiAvailable, searchQuery, filters]);

  const loadAnimes = async (pageNum = 1, refresh = false) => {
    if (!isApiAvailable) return;
    const requestId = ++latestRequest.current;
    setLoadError(null);

    try {
      if (refresh) {
        if (!searchQuery.trim() && animes.length === 0) setLoading(true);
        setIsChangingPage(true);
        setPage(1);
        setHasMore(true);
        setPageCache(new Map()); // Vider le cache
      } else if (pageNum !== 1) {
        setIsChangingPage(true);
      } else {
        setLoading(true);
      }

      // Vérifier le cache d'abord
      if (pageCache.has(pageNum) && !refresh && !searchQuery.trim()) {
        console.log(`[Catalog] 🚀 Page ${pageNum} chargée depuis le cache`);
        setAnimes(pageCache.get(pageNum)!);
        setPage(pageNum);
        setIsChangingPage(false);

        // Précharger les pages adjacentes en arrière-plan
        return;
      }

      console.log(`[Catalog] 📡 Chargement de la page ${pageNum} depuis l'API`);
      const response = await apiService.searchAnimesByFilters({
        query: searchQuery.trim(), genres: filters.genres, years: filters.years,
        studio: filters.studio.trim(), status: filters.status === 'all' ? undefined : filters.status,
        sortBy: filters.sortBy, sortOrder: filters.sortOrder, page: pageNum, limit: 20,
      });
      if (requestId !== latestRequest.current) return;

      const animeData = response.animes || [];

      // Mettre en cache
      if (!searchQuery.trim()) setPageCache(prev => new Map(prev).set(pageNum, animeData));

      setAnimes(animeData);
      setHasMore(response.hasMore);
      setTotalPages(response.totalPages || 1);
      setTotalItems(response.totalItems ?? animeData.length);
      setPage(pageNum);

      // Précharger les pages adjacentes
    } catch (error) {
      if (requestId === latestRequest.current) setLoadError('Le catalogue ne peut pas être chargé. Réessayez dans un instant.');
      console.error('[Catalog] Erreur lors du chargement des animés:', error);
    } finally {
      if (requestId === latestRequest.current) { setLoading(false); setIsChangingPage(false); }
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAnimes(1, true);
    setRefreshing(false);
  }, [isApiAvailable, searchQuery, filters]);

  // Pagination : page suivante/précédente optimisées
  const goToPrevPage = () => {
    if (page > 1) {
      loadAnimes(page - 1, false);
    }
  };

  const goToNextPage = () => {
    if (page < totalPages) {
      loadAnimes(page + 1, false);
    }
  };

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages && pageNum !== page) {
      loadAnimes(pageNum, false);
    }
  };


  const toggleGenre = (genre: string) => {
    setFilters(prev => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter(g => g !== genre)
        : [...prev.genres, genre]
    }));
  };

  const toggleYear = (year: number) => {
    setFilters(prev => ({
      ...prev,
      years: prev.years.includes(year)
        ? prev.years.filter(y => y !== year)
        : [...prev.years, year]
    }));
  };

  const clearFilters = () => {
    setFilters({
      genres: [],
      status: 'all',
      years: [],
      studio: '',
      sortBy: 'popularity',
      sortOrder: 'desc',
    });
    setSearchQuery('');
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.genres.length > 0) count++;
    if (filters.status !== 'all') count++;
    if (filters.years.length > 0) count++;
    if (filters.studio.trim()) count++;
    return count;
  };

  const hasActiveFilters = getActiveFiltersCount() > 0 || searchQuery.trim().length > 0;

  const navigateToAnimeDetail = (anime: Anime) => {
    navigation.navigate('AnimeDetail', { animeId: anime.id });
  };

  const renderAnimeCard = ({ item }: { item: Anime }) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Découvrir ${item.title}`}
      style={[styles.animeCard, { width: cardWidth, height: cardWidth * 1.48, backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigateToAnimeDetail(item)}
      activeOpacity={0.7}
    >
      {item.thumbnail ? (
        <Image
          source={{ uri: item.thumbnail }}
          style={styles.animePoster}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.animePlaceholder, { backgroundColor: colors.surface }]}>
          <Text style={[styles.animeInitial, { color: colors.textSecondary }]}>
            {item.title[0]}
          </Text>
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.animeOverlay}
      >
        <View style={styles.animeInfo}>
          <Text style={[styles.animeTitle, { color: '#ffffff' }]} numberOfLines={2}>
            {item.title}
          </Text>

          <View style={styles.animeMetadata}>
            <Text style={[styles.animeYear, { color: '#ffffff' }]}>
              {item.year > 1900 ? item.year : '—'}
            </Text>
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={14} color="#fbbf24" />
              <Text style={[styles.animeRating, { color: '#ffffff' }]}>
                {item.rating > 0 ? item.rating.toFixed(1) : '—'}
              </Text>
            </View>
          </View>

          <Text style={[styles.animeGenres, { color: '#ffffff' }]} numberOfLines={1}>
            {(item.genres || []).slice(0, 3).join(', ')}
          </Text>

          {item.status !== AnimeStatus.UNKNOWN && <View style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) + '90' }
          ]}>
            <Text style={[styles.statusText, { color: '#ffffff' }]}>
              {getStatusText(item.status)}
            </Text>
          </View>}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  const getStatusColor = (status: AnimeStatus) => {
    switch (status) {
      case AnimeStatus.ONGOING:
        return colors.primary;
      case AnimeStatus.COMPLETED:
        return '#16a34a';
      case AnimeStatus.UPCOMING:
        return '#f59e0b';
      case AnimeStatus.PAUSED:
        return '#dc2626';
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: AnimeStatus | string) => {
    // Handle both enum values and string values from API
    const statusStr = typeof status === 'string' ? status.toLowerCase() : status;

    switch (statusStr) {
      case AnimeStatus.ONGOING:
      case 'ongoing':
      case 'en cours':
      case 'airing':
        return 'En cours';
      case AnimeStatus.COMPLETED:
      case 'completed':
      case 'terminé':
      case 'finished':
      case 'ended':
        return 'Terminé';
      case AnimeStatus.UPCOMING:
      case 'upcoming':
      case 'à venir':
      case 'not yet aired':
        return 'À venir';
      case AnimeStatus.PAUSED:
      case 'paused':
      case 'en pause':
      case 'hiatus':
        return 'En pause';
      default:
        return status ? String(status) : 'Inconnu';
    }
  };

  const renderFiltersModal = () => (
    <CustomModal
      visible={showFilters}
      onRequestClose={() => setShowFilters(false)}
      alignment="bottom"
    >
      <SafeAreaView style={[styles.filtersContainer, { backgroundColor: colors.background }]}>
        <View style={styles.filtersHeader}>
          <TouchableOpacity onPress={() => setShowFilters(false)}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.filtersTitle, { color: colors.text }]}>Filtres</Text>
          <TouchableOpacity onPress={clearFilters}>
            <Text style={[styles.clearButton, { color: colors.primary }]}>Effacer</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.filtersContent} showsVerticalScrollIndicator={false}>
          {/* Tri */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterTitle, { color: colors.text }]}>Trier par</Text>
            <View style={styles.sortContainer}>
              {SORT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.sortOption,
                    {
                      backgroundColor: filters.sortBy === option.key ? colors.buttonBg : colors.surface,
                      borderColor: colors.border,
                    }
                  ]}
                  onPress={() => setFilters(prev => ({ ...prev, sortBy: option.key }))}
                >
                  <Text style={[
                    styles.sortOptionText,
                    { color: filters.sortBy === option.key ? 'white' : colors.text }
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.sortOrderButton, { borderColor: colors.border }]}
              onPress={() => setFilters(prev => ({
                ...prev,
                sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc'
              }))}
            >
              <Ionicons
                name={filters.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.sortOrderText, { color: colors.text }]}>
                {filters.sortOrder === 'asc' ? 'Croissant' : 'Décroissant'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Statut */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterTitle, { color: colors.text }]}>Statut</Text>
            <View style={styles.statusContainer}>
              {[
                { key: 'all', label: 'Tous' },
                { key: AnimeStatus.ONGOING, label: 'En cours' },
                { key: AnimeStatus.COMPLETED, label: 'Terminé' },
                { key: AnimeStatus.UPCOMING, label: 'À venir' },
                { key: AnimeStatus.PAUSED, label: 'En pause' },
              ].map((status) => (
                <TouchableOpacity
                  key={status.key}
                  style={[
                    styles.statusOption,
                    {
                      backgroundColor: filters.status === status.key ? colors.buttonBg : colors.surface,
                      borderColor: colors.border,
                    }
                  ]}
                  onPress={() => setFilters(prev => ({ ...prev, status: status.key as any }))}
                >
                  <Text style={[
                    styles.statusOptionText,
                    { color: filters.status === status.key ? 'white' : colors.text }
                  ]}>
                    {status.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Genres */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterTitle, { color: colors.text }]}>Genres</Text>
            <View style={styles.genresContainer}>
              {availableGenres.map((genre) => (
                <TouchableOpacity
                  key={genre}
                  style={[
                    styles.genreChip,
                    {
                      backgroundColor: filters.genres.includes(genre) ? colors.buttonBg : colors.surface,
                      borderColor: colors.border,
                    }
                  ]}
                  onPress={() => toggleGenre(genre)}
                >
                  <Text style={[
                    styles.genreChipText,
                    { color: filters.genres.includes(genre) ? 'white' : colors.text }
                  ]}>
                    {genre}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Années */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterTitle, { color: colors.text }]}>Années</Text>
            <View style={styles.yearsContainer}>
              {YEARS.map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearChip,
                    {
                      backgroundColor: filters.years.includes(year) ? colors.buttonBg : colors.surface,
                      borderColor: colors.border,
                    }
                  ]}
                  onPress={() => toggleYear(year)}
                >
                  <Text style={[
                    styles.yearChipText,
                    { color: filters.years.includes(year) ? 'white' : colors.text }
                  ]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Studio */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterTitle, { color: colors.text }]}>Studio</Text>
            <TextInput
              style={[
                styles.studioInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                }
              ]}
              placeholder="Nom du studio..."
              placeholderTextColor={colors.textSecondary}
              value={filters.studio}
              onChangeText={(text) => setFilters(prev => ({ ...prev, studio: text }))}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </CustomModal>
  );


  // DEBUG : log des états pagination
  console.log({ animes, page, totalPages, hasMore });

  if (!isApiAvailable) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.offlineContainer}>
          <Ionicons name="cloud-offline-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.offlineTitle, { color: colors.text }]}>Mode Hors Ligne</Text>
          <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
            Le catalogue n'est pas disponible en mode hors ligne.
            Connectez-vous à internet pour parcourir les animés.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Chargement du catalogue...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {loadError && <TouchableOpacity accessibilityRole="button" onPress={() => loadAnimes(1, true)} style={{ padding: 16, backgroundColor: colors.surface }}><Text style={{ color: colors.error }}>{loadError} Appuyer pour réessayer.</Text></TouchableOpacity>}
      {/* Header avec recherche */}
      <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 4 }}><Text style={{ color: colors.textSecondary, fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 8 }}>TROUVEZ VOTRE PROCHAINE HISTOIRE</Text><Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1 }}>Explorer</Text></View>
      <View style={styles.header}>
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Rechercher un animé..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Filtrer le catalogue"
          style={[styles.filterButton, { backgroundColor: colors.buttonBg }]}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons name="options" size={20} color="white" />
          {getActiveFiltersCount() > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{getActiveFiltersCount()}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.resultsHeader}><Text style={[styles.resultsCount, { color: colors.textSecondary }]}>{isChangingPage ? 'Recherche en cours…' : `${totalItems.toLocaleString('fr-FR')} anime${totalItems > 1 ? 's' : ''}`}</Text></View>
      {/* Résultats */}
      <View style={{ flex: 1 }}>
        <FlatList
          data={animes}
          keyExtractor={(item) => item.id}
          renderItem={renderAnimeCard}
          key={columnCount}
          numColumns={columnCount}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={64} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Aucun résultat
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Essayez de modifier vos critères de recherche
              </Text>
            </View>
          )}
        />
      </View>

      {/* Pagination - visible quand il y a des résultats et que l'API est disponible */}
      {!loading && isApiAvailable && animes.length > 0 && (
        <View style={[styles.paginationContainer, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, { bottom: 74 + insets.bottom + 10 }]}>
          <TouchableOpacity
            onPress={goToPrevPage}
            disabled={page === 1 || isChangingPage}
            style={[
              styles.paginationButton,
              {
                backgroundColor: colors.buttonBg,
                opacity: (page === 1 || isChangingPage) ? 0.5 : 1
              }
            ]}
          >
            <Ionicons name="chevron-back" size={16} color="white" />
            <Text style={styles.paginationButtonText}>Précédent</Text>
          </TouchableOpacity>

          <View style={styles.paginationInfo}>
            {isChangingPage ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.paginationText, { color: colors.text }]}>
                {page}{totalPages ? ` / ${totalPages}` : ''}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={goToNextPage}
            disabled={Boolean(!hasMore || (totalPages && page >= totalPages) || isChangingPage)}
            style={[
              styles.paginationButton,
              {
                backgroundColor: colors.buttonBg,
                opacity: (!hasMore || (totalPages && page >= totalPages) || isChangingPage) ? 0.5 : 1
              }
            ]}
          >
            <Text style={styles.paginationButtonText}>Suivant</Text>
            <Ionicons name="chevron-forward" size={16} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {renderFiltersModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  resultsHeader: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  resultsCount: {
    fontSize: 14,
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  row: {
    justifyContent: 'flex-start',
    gap: 14,
  },
  animeCard: {
    width: (screenWidth - 60) / 2,
    height: 280,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 4,
    elevation: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  animePoster: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  animePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  animeInitial: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  animeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  animeInfo: {
    flex: 1,
  },
  animeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 18,
  },
  animeMetadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  animeYear: {
    fontSize: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  animeRating: {
    fontSize: 12,
    marginLeft: 2,
  },
  animeGenres: {
    fontSize: 12,
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  offlineTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  offlineText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  filtersContainer: {
    flex: 1,
  },
  filtersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filtersTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  clearButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  filtersContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  filterSection: {
    marginVertical: 20,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  sortContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sortOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  sortOrderText: {
    fontSize: 14,
    marginLeft: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  statusOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  genreChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  yearsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  yearChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  studioInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  // Styles pour la pagination
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'absolute',
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: 'transparent', // blanc semi-transparent
    borderRadius: 15, // bel arrondi
    paddingHorizontal: 18,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10,
  },
  paginationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    justifyContent: 'center',
  },
  paginationButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
    marginHorizontal: 4,
  },
  paginationInfo: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  paginationText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CatalogScreen;
