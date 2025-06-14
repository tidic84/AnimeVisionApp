import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  SafeAreaView,
  useColorScheme,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MainTabScreenProps } from '../../types/navigation';
import { Anime, AnimeStatus } from '../../types/anime';
import apiService from '../../services/apiService';
import { useApi } from '../../contexts/ApiContext';

type CatalogScreenProps = MainTabScreenProps<'Catalog'>;

const { width: screenWidth } = Dimensions.get('window');

const Colors = {
  light: {
    primary: '#6366f1',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    card: '#ffffff',
    accent: '#3b82f6',
  },
  dark: {
    primary: '#818cf8',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    card: '#1e293b',
    accent: '#60a5fa',
  },
};

const GENRES = [
  'Action', 'Aventure', 'Comédie', 'Drame', 'Fantasy', 'Horreur',
  'Mystère', 'Romance', 'Science-Fiction', 'Slice of Life', 'Sport',
  'Surnaturel', 'Thriller', 'École', 'Magie', 'Mecha', 'Militaire',
  'Musique', 'Psychologique', 'Historique', 'Josei', 'Seinen', 'Shojo', 'Shonen'
];

const YEARS = Array.from({ length: 30 }, (_, i) => 2024 - i);

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
  const colors = Colors[colorScheme ?? 'light'];
  const { isApiAvailable } = useApi();
  
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [filteredAnimes, setFilteredAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    genres: [],
    status: 'all',
    years: [],
    studio: '',
    sortBy: 'popularity',
    sortOrder: 'desc',
  });

  useEffect(() => {
    if (isApiAvailable) {
      loadAnimes();
    }
  }, [isApiAvailable]);

  useEffect(() => {
    applyFilters();
  }, [animes, searchQuery, filters]);

  const loadAnimes = async (pageNum = 1, refresh = false) => {
    if (!isApiAvailable) return;

    try {
      if (refresh) {
        setLoading(true);
        setPage(1);
        setHasMore(true);
      } else if (pageNum > 1) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const response = await apiService.getAnimeList(pageNum, 20);
      
      if (refresh || pageNum === 1) {
        setAnimes(response.animes);
      } else {
        setAnimes(prev => [...prev, ...response.animes]);
      }

      setHasMore(response.hasMore);
      setPage(pageNum);
    } catch (error) {
      console.error('[Catalog] Erreur lors du chargement des animés:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAnimes(1, true);
    setRefreshing(false);
  }, []);

  const loadMore = () => {
    if (!loadingMore && hasMore && isApiAvailable) {
      loadAnimes(page + 1);
    }
  };

  const applyFilters = useMemo(() => {
    return () => {
      let filtered = [...animes];

      // Recherche par titre
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(anime =>
          anime.title.toLowerCase().includes(query) ||
          anime.originalTitle?.toLowerCase().includes(query) ||
          anime.genres.some(genre => genre.toLowerCase().includes(query))
        );
      }

      // Filtre par genres
      if (filters.genres.length > 0) {
        filtered = filtered.filter(anime =>
          filters.genres.some(genre => anime.genres.includes(genre))
        );
      }

      // Filtre par statut
      if (filters.status !== 'all') {
        filtered = filtered.filter(anime => anime.status === filters.status);
      }

      // Filtre par années
      if (filters.years.length > 0) {
        filtered = filtered.filter(anime => filters.years.includes(anime.year));
      }

      // Filtre par studio
      if (filters.studio.trim()) {
        const studio = filters.studio.toLowerCase();
        filtered = filtered.filter(anime =>
          anime.studio.toLowerCase().includes(studio)
        );
      }

      // Tri
      filtered.sort((a, b) => {
        let comparison = 0;
        
        switch (filters.sortBy) {
          case 'popularity':
            comparison = a.rating - b.rating; // Plus la note est haute, plus c'est populaire
            break;
          case 'rating':
            comparison = a.rating - b.rating;
            break;
          case 'year':
            comparison = a.year - b.year;
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'newest':
            comparison = a.year - b.year;
            break;
          default:
            return 0;
        }

        return filters.sortOrder === 'desc' ? -comparison : comparison;
      });

      setFilteredAnimes(filtered);
    };
  }, [animes, searchQuery, filters]);

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

  const navigateToAnimeDetail = (anime: Anime) => {
    navigation.navigate('AnimeDetail', { animeId: anime.id });
  };

  const renderAnimeCard = ({ item }: { item: Anime }) => (
    <TouchableOpacity
      style={[styles.animeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigateToAnimeDetail(item)}
      activeOpacity={0.7}
    >
      <View style={styles.animeThumbnail}>
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
      </View>
      
      <View style={styles.animeInfo}>
        <Text style={[styles.animeTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        
        <View style={styles.animeMetadata}>
          <Text style={[styles.animeYear, { color: colors.textSecondary }]}>
            {item.year}
          </Text>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={14} color="#fbbf24" />
            <Text style={[styles.animeRating, { color: colors.textSecondary }]}>
              {item.rating.toFixed(1)}
            </Text>
          </View>
        </View>

        <Text style={[styles.animeGenres, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.genres.slice(0, 3).join(', ')}
        </Text>

        <View style={[
          styles.statusBadge,
          { backgroundColor: getStatusColor(item.status) + '20' }
        ]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>
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

  const getStatusText = (status: AnimeStatus) => {
    switch (status) {
      case AnimeStatus.ONGOING:
        return 'En cours';
      case AnimeStatus.COMPLETED:
        return 'Terminé';
      case AnimeStatus.UPCOMING:
        return 'À venir';
      case AnimeStatus.PAUSED:
        return 'En pause';
      default:
        return 'Inconnu';
    }
  };

  const renderFiltersModal = () => (
    <Modal
      visible={showFilters}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowFilters(false)}
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
                      backgroundColor: filters.sortBy === option.key ? colors.primary : colors.surface,
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
                      backgroundColor: filters.status === status.key ? colors.primary : colors.surface,
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
              {GENRES.map((genre) => (
                <TouchableOpacity
                  key={genre}
                  style={[
                    styles.genreChip,
                    {
                      backgroundColor: filters.genres.includes(genre) ? colors.primary : colors.surface,
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
                      backgroundColor: filters.years.includes(year) ? colors.primary : colors.surface,
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
    </Modal>
  );

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header avec recherche */}
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
          style={[styles.filterButton, { backgroundColor: colors.primary }]}
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

      {/* Résultats */}
      <View style={styles.resultsHeader}>
        <Text style={[styles.resultsCount, { color: colors.textSecondary }]}>
          {filteredAnimes.length} résultat{filteredAnimes.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={filteredAnimes}
        keyExtractor={(item) => item.id}
        renderItem={renderAnimeCard}
        numColumns={2}
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
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={() => (
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        )}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
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
    borderRadius: 8,
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
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  resultsCount: {
    fontSize: 14,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  row: {
    justifyContent: 'space-between',
  },
  animeCard: {
    width: (screenWidth - 60) / 2,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  animeThumbnail: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  animePoster: {
    width: '100%',
    height: '100%',
  },
  animePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  animeInitial: {
    fontSize: 32,
    fontWeight: 'bold',
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
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filtersTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  clearButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  filtersContent: {
    flex: 1,
    paddingHorizontal: 20,
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
    borderRadius: 8,
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
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
});

export default CatalogScreen; 