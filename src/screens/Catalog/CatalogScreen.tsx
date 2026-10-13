import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, Platform, Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabScreenProps } from '../../types/navigation';
import { Anime, AnimeStatus } from '../../types/anime';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { useApi } from '../../contexts/ApiContext';
import { palette } from '../../theme/palette';
import apiService from '../../services/apiService';
import CustomModal from '../../components/CustomModal';
import useReducedMotion from '../../hooks/useReducedMotion';
import { SkeletonBlock, SkeletonGroup } from '../../components/SkeletonCard/SkeletonCard';
import { LoadingSwap } from '../../components/Motion';

type Tab = 'all' | 'simulcast' | 'genres';
type Sheet = 'filters' | 'sort' | 'years' | null;
const SORTS = [{ key: 'popularity', label: 'Populaire' }, { key: 'rating', label: 'Les mieux notés' }, { key: 'newest', label: 'Ajouts récents' }, { key: 'title', label: 'Alphabétique' }, { key: 'year', label: 'Année de sortie' }];
const GENRE_LABELS: Record<string, string> = { adventure: 'Aventure', comedy: 'Comédie', drama: 'Drame', fantasy: 'Fantastique', 'sci-fi': 'Science-fiction', 'slice of life': 'Tranche de vie', shounen: 'Shōnen', shoujo: 'Shōjo' };
const genreLabel = (genre: string) => GENRE_LABELS[genre.toLowerCase()] || genre;
const genreIcon = (genre: string): React.ComponentProps<typeof Ionicons>['name'] => {
  const normalized = genre.toLowerCase();
  if (/action|sh[oō]nen|shounen/.test(normalized)) return 'flame-outline';
  if (/romance|drama|drame/.test(normalized)) return 'heart-outline';
  if (/fantasy|fantast|magie/.test(normalized)) return 'sparkles-outline';
  if (/science|sci-fi|mecha/.test(normalized)) return 'planet-outline';
  if (/com[eé]d/.test(normalized)) return 'happy-outline';
  if (/sport/.test(normalized)) return 'basketball-outline';
  if (/music|musique/.test(normalized)) return 'musical-notes-outline';
  return 'compass-outline';
};

export default function CatalogScreen({ navigation }: MainTabScreenProps<'Catalog'>) {
  const colors = palette[useAppColorScheme() ?? 'dark'];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const columns = width > 1100 ? 6 : width > 760 ? 4 : width > 540 ? 3 : 2;
  const cardWidth = (width - 32 - (columns - 1) * 8) / columns;
  const { isApiAvailable } = useApi();
  const reducedMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>('all');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [genreVisibleCount, setGenreVisibleCount] = useState(16);
  const genreCache = useRef<Record<string, string>>({});
  const yearsLoaded = useRef(false);
  const [genrePosters, setGenrePosters] = useState<Record<string, string>>({});
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [year, setYear] = useState<number | undefined>();
  const [years, setYears] = useState<number[]>([]);
  const [studio, setStudio] = useState('');
  const [status, setStatus] = useState<AnimeStatus | undefined>();
  const [sort, setSort] = useState('popularity');
  const [ascending, setAscending] = useState(false);
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const listRef = useRef<FlatList<Anime>>(null);

  useEffect(() => {
    if (!isApiAvailable) return;
    let active = true;
    apiService.getAvailableGenres().then(async available => {
      if (!active) return;
      const priority = ['Action', 'Aventure', 'Comédie', 'Drame', 'Fantastique', 'Romance', 'Science-fiction', 'Seinen', 'Shonen', 'Shōnen', 'Shojo', 'Shōjo', 'Tranche de vie'];
      const rank = (genre: string) => { const index = priority.findIndex(value => value.toLocaleLowerCase('fr-FR') === genre.toLocaleLowerCase('fr-FR')); return index < 0 ? priority.length : index; };
      available.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'));
      setGenres(available);
    }).catch(() => {});
    return () => { active = false; };
  }, [isApiAvailable]);

  useEffect(() => {
    if (!isApiAvailable || tab !== 'genres') return;
    let active = true;
    const loadPosters = async () => {
      const missing = genres.slice(0, genreVisibleCount).filter(genre => !genreCache.current[genre]);
      for (let index = 0; index < missing.length && active; index += 4) {
        const batch = missing.slice(index, index + 4);
        const results = await Promise.allSettled(batch.map(genre => apiService.getAnimesByGenre(genre, 1)));
        results.forEach((result, i) => { if (result.status === 'fulfilled' && result.value[0]?.thumbnail) genreCache.current[batch[i]] = result.value[0].thumbnail; });
        if (active) setGenrePosters({ ...genreCache.current });
      }
    };
    void loadPosters();
    return () => { active = false; };
  }, [isApiAvailable, tab, genres, genreVisibleCount]);

  useEffect(() => {
    if (!isApiAvailable || yearsLoaded.current || (sheet !== 'filters' && sheet !== 'years')) return;
    let active = true;
    const loadYears = async () => {
      const available = new Set<number>();
      let metadataPage = 1;
      let hasMore = true;
      while (active && hasMore) {
        const response = await apiService.searchAnimesByFilters({ sortBy: 'year', sortOrder: 'desc', limit: 50, page: metadataPage });
        if (!active) return;
        response.animes.forEach(anime => { if (anime.year > 1900) available.add(anime.year); });
        setYears([...available].sort((a, b) => b - a));
        // With descending years, unknown dates come after all dated titles.
        hasMore = response.hasMore && response.animes.every(anime => anime.year > 1900);
        metadataPage += 1;
      }
    };
    loadYears().then(() => { if (active) yearsLoaded.current = true; }).catch(() => {});
    return () => { active = false; };
  }, [isApiAvailable, sheet]);

  const load = async (nextPage = 1, refresh = false) => {
    if (!isApiAvailable) { opacity.stopAnimation(); opacity.setValue(1); setLoading(false); setRefreshing(false); return; }
    const token = ++request.current;
    opacity.stopAnimation();
    if (!reducedMotion && animes.length > 0) {
      Animated.timing(opacity, { toValue: 0.68, duration: 180, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
    }
    setLoading(true);
    setError('');
    if (refresh) setRefreshing(true);
    try {
      const response = await apiService.searchAnimesByFilters({ query: query.trim(), genres: selectedGenres, year, studio: studio.trim(), status: tab === 'simulcast' ? AnimeStatus.ONGOING : status, sortBy: sort, sortOrder: ascending ? 'asc' : 'desc', page: nextPage, limit: 24 });
      if (token !== request.current) return;
      setAnimes(response.animes);
      setPage(nextPage);
      setPages(response.totalPages || 1);
      setTotal(response.totalItems ?? response.animes.length);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });

    } catch { if (token === request.current) setError('Le catalogue ne peut pas être chargé. Appuyez pour réessayer.'); }
    finally {
      if (token === request.current) {
        setLoading(false);
        setRefreshing(false);
        opacity.stopAnimation();
        if (reducedMotion) opacity.setValue(1);
        else Animated.timing(opacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
      }
    }
  };
  useEffect(() => {
    if (tab === 'genres') { setLoading(false); return; }
    const timer = setTimeout(() => { load(1); }, query.trim() ? 300 : 0);
    return () => { clearTimeout(timer); request.current += 1; opacity.stopAnimation(); };
  }, [isApiAvailable, tab, query, selectedGenres, year, studio, status, sort, ascending]);

  useEffect(() => {
    if (reducedMotion) { opacity.stopAnimation(); opacity.setValue(1); }
    return () => { opacity.stopAnimation(); };
  }, [reducedMotion, opacity]);

  const skeletonGrid = (
    <SkeletonGroup><View accessibilityLabel="Chargement du catalogue" style={styles.skeletonGrid}>
      {Array.from({ length: columns * 3 }, (_, index) => (
        <View key={index} style={{ width: cardWidth, marginBottom: 22 }}>
          <SkeletonBlock width={cardWidth} height={cardWidth * 1.5} />
          <SkeletonBlock width={cardWidth * 0.85} height={22} style={{ marginTop: 10 }} />
          <SkeletonBlock width={cardWidth * 0.6} height={18} style={{ marginTop: 10 }} />
        </View>
      ))}
    </View></SkeletonGroup>
  );
  const reset = () => { setSelectedGenres([]); setYear(undefined); setStudio(''); setStatus(undefined); setQuery(''); };
  const toggleGenre = (genre: string) => setSelectedGenres(previous => previous.includes(genre) ? previous.filter(value => value !== genre) : [...previous, genre]);
  const activeCount = selectedGenres.length + Number(Boolean(year)) + Number(Boolean(studio)) + Number(Boolean(status));
  const button = (label: string, active: boolean, onPress: () => void) => <TouchableOpacity key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}><Text style={{ color: active ? colors.buttonText : colors.text }}>{label}</Text></TouchableOpacity>;
  const renderCard = ({ item }: { item: Anime }) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Découvrir ${item.title}`} activeOpacity={0.8} onPress={() => navigation.navigate('AnimeDetail', { animeId: item.id })} style={{ width: cardWidth, marginBottom: 22 }}>
      {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={{ width: cardWidth, height: cardWidth * 1.5, backgroundColor: colors.surface }} resizeMode="cover" /> : <View style={[styles.posterPlaceholder, { width: cardWidth, height: cardWidth * 1.5, backgroundColor: colors.surface }]}><Ionicons name="film-outline" size={36} color={colors.textSecondary} /></View>}
      <Text numberOfLines={1} style={[styles.animeTitle, { color: colors.text }]}>{item.title}</Text>
      <Text numberOfLines={1} style={[styles.metadata, { color: colors.textSecondary }]}>{[item.year > 1900 ? item.year : '', ...(item.genres || []).slice(0, 2).map(genreLabel)].filter(Boolean).join(' · ') || 'Anime'}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={styles.header}><Text style={[styles.title, { color: colors.text }]}>Naviguer</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={searchOpen ? 'Fermer la recherche' : 'Rechercher un anime'} onPress={() => setSearchOpen(value => !value)} style={styles.iconButton}><Ionicons name={searchOpen ? 'close-outline' : 'search-outline'} size={29} color={colors.text} /></TouchableOpacity></View>
      {searchOpen && <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="search-outline" size={20} color={colors.textSecondary} /><TextInput autoFocus placeholder="Rechercher un anime" accessibilityLabel="Rechercher un anime" placeholderTextColor={colors.textSecondary} value={query} onChangeText={value => { setQuery(value); if (tab === 'genres') setTab('all'); }} style={{ flex: 1, padding: 10, color: colors.text, fontSize: 16 }} />{query.length > 0 && <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Effacer la recherche"><Ionicons name="close-circle" size={20} color={colors.textSecondary} /></TouchableOpacity>}</View>}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>{([{ key: 'all', label: 'Tous les anime' }, { key: 'simulcast', label: 'Simulcast' }, { key: 'genres', label: 'Genres' }] as const).map(option => <TouchableOpacity key={option.key} accessibilityRole="tab" accessibilityState={{ selected: tab === option.key }} onPress={() => setTab(option.key)} style={[styles.tab, { borderBottomColor: tab === option.key ? colors.primary : 'transparent' }]}><Text style={{ fontWeight: '700', fontSize: 14, color: tab === option.key ? colors.text : colors.textSecondary }}>{option.label}</Text></TouchableOpacity>)}</View>
      {tab === 'genres' ? <ScrollView contentContainerStyle={styles.genreGrid}><View style={styles.genreRows}>{genres.slice(0, genreVisibleCount).map(genre => <TouchableOpacity key={genre} accessibilityRole="button" accessibilityLabel={`Explorer le genre ${genreLabel(genre)}`} onPress={() => { setSelectedGenres([genre]); setTab('all'); }} style={[styles.genreTile, { width: cardWidth, height: cardWidth * 0.58, backgroundColor: colors.surface }]}>{genrePosters[genre] && <Image source={{ uri: genrePosters[genre] }} style={StyleSheet.absoluteFill} resizeMode="cover" />}<LinearGradient colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0.8)']} style={[StyleSheet.absoluteFill, styles.genreContent]}><Ionicons name={genreIcon(genre)} size={27} color="#fff" /><Text style={styles.genreName} numberOfLines={2}>{genreLabel(genre).toLocaleUpperCase('fr-FR')}</Text></LinearGradient></TouchableOpacity>)}</View>{genres.length > genreVisibleCount && <TouchableOpacity accessibilityRole="button" onPress={() => setGenreVisibleCount(value => value + 16)} style={{ paddingVertical: 22 }}><Text style={{ color: colors.primary, fontWeight: '600', textAlign: 'center' }}>Afficher plus de genres</Text></TouchableOpacity>}{genres.length === 0 && <Text style={{ color: colors.textSecondary, padding: 24 }}>Les genres seront disponibles à la connexion au catalogue.</Text>}</ScrollView> : <>
        <View style={styles.toolbar}><TouchableOpacity disabled={tab !== 'simulcast'} accessibilityLabel="Choisir l’année de diffusion" onPress={() => setSheet('years')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ color: colors.text, fontSize: 20 }}>{tab === 'simulcast' ? (year ? `En cours · ${year}` : 'Diffusions en cours') : selectedGenres.length ? selectedGenres.map(genreLabel).join(', ') : SORTS.find(option => option.key === sort)?.label}</Text>{tab === 'simulcast' && <Ionicons name="chevron-down" size={18} color={colors.text} />}</TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Trier le catalogue" onPress={() => setSheet('sort')} style={styles.iconButton}><Ionicons name="filter-outline" size={26} color={colors.text} /></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Filtrer le catalogue" onPress={() => setSheet('filters')} style={styles.iconButton}><Ionicons name="options-outline" size={26} color={activeCount ? colors.primary : colors.text} /></TouchableOpacity></View>
        {activeCount > 0 && <View style={styles.activeFilters}><Text style={{ color: colors.textSecondary, flex: 1 }}>{activeCount} filtre{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}</Text><TouchableOpacity onPress={reset}><Text style={{ color: colors.primary }}>Effacer</Text></TouchableOpacity></View>}
        {error && <TouchableOpacity onPress={() => load(1)} style={{ padding: 16 }}><Text style={{ color: colors.error }}>{error}</Text></TouchableOpacity>}
        <LoadingSwap loading={loading && animes.length === 0} skeleton={skeletonGrid} style={{ flex: 1 }}><Animated.View style={{ flex: 1, opacity }}><FlatList ref={listRef} key={columns} data={animes} renderItem={renderCard} keyExtractor={item => item.id} numColumns={columns} columnWrapperStyle={{ gap: 8 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, true)} tintColor={colors.primary} />} ListEmptyComponent={<View style={styles.empty}>{loading ? null : <><Ionicons name="search-outline" size={42} color={colors.textSecondary} /><Text style={{ color: colors.text, fontSize: 20, marginTop: 16 }}>{isApiAvailable ? 'Aucun résultat' : 'Catalogue indisponible'}</Text><Text style={[styles.emptyText, { color: colors.textSecondary }]}>{tab === 'simulcast' ? 'Aucune diffusion en cours renseignée pour ces critères.' : 'Essayez de modifier les filtres ou de vous reconnecter.'}</Text></>}</View>} ListFooterComponent={animes.length > 0 ? <View style={[styles.pagination, { borderTopColor: colors.border }]}><TouchableOpacity accessibilityLabel="Page précédente" disabled={page <= 1 || loading} onPress={() => load(page - 1)} style={[styles.iconButton, { opacity: page <= 1 || loading ? 0.3 : 1 }]}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity><View style={{ alignItems: 'center' }}>{loading ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.text }}>{page} / {pages}</Text>}<Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>{total.toLocaleString('fr-FR')} anime</Text></View><TouchableOpacity accessibilityLabel="Page suivante" disabled={page >= pages || loading} onPress={() => load(page + 1)} style={[styles.iconButton, { opacity: page >= pages || loading ? 0.3 : 1 }]}><Ionicons name="chevron-forward" size={24} color={colors.text} /></TouchableOpacity></View> : null} /></Animated.View></LoadingSwap>
      </>}
      <CustomModal visible={sheet !== null} onRequestClose={() => setSheet(null)} alignment="bottom"><View style={{ paddingBottom: Math.max(insets.bottom, 16), maxHeight: '100%' }}><View style={styles.sheetHeader}><Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>{sheet === 'sort' ? 'Trier par' : sheet === 'years' ? 'Année de diffusion' : 'Filtres'}</Text><TouchableOpacity accessibilityLabel="Fermer" onPress={() => setSheet(null)} style={styles.iconButton}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity></View><ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 16 }}>
        {sheet === 'sort' ? <>{SORTS.map(option => <TouchableOpacity key={option.key} onPress={() => { setSort(option.key); setSheet(null); }} style={styles.sortRow}><Text style={{ color: colors.text, fontSize: 17 }}>{option.label}</Text>{sort === option.key && <Ionicons name="checkmark" size={22} color={colors.primary} />}</TouchableOpacity>)}{button(ascending ? 'Ordre croissant' : 'Ordre décroissant', false, () => setAscending(value => !value))}</> : sheet === 'years' ? <View style={styles.chips}>{button('Toutes les années', !year, () => { setYear(undefined); setSheet(null); })}{years.map(value => button(String(value), year === value, () => { setYear(value); setSheet(null); }))}</View> : <>
          <TouchableOpacity onPress={reset}><Text style={{ color: colors.primary, marginBottom: 18 }}>Effacer les filtres</Text></TouchableOpacity><Text style={[styles.sectionTitle, { color: colors.text }]}>Genres</Text><View style={styles.chips}>{genres.map(genre => button(genreLabel(genre), selectedGenres.includes(genre), () => toggleGenre(genre)))}</View><Text style={[styles.sectionTitle, { color: colors.text }]}>Année de sortie</Text><View style={styles.chips}>{button('Toutes', !year, () => setYear(undefined))}{years.map(value => button(String(value), value === year, () => setYear(value)))}</View>{tab !== 'simulcast' && <><Text style={[styles.sectionTitle, { color: colors.text }]}>Statut</Text><View style={styles.chips}>{button('Tous', !status, () => setStatus(undefined))}{([{ value: AnimeStatus.ONGOING, label: 'En cours' }, { value: AnimeStatus.COMPLETED, label: 'Terminé' }, { value: AnimeStatus.UPCOMING, label: 'À venir' }, { value: AnimeStatus.PAUSED, label: 'En pause' }]).map(option => button(option.label, option.value === status, () => setStatus(option.value)))}</View></>}<Text style={[styles.sectionTitle, { color: colors.text }]}>Studio</Text><TextInput accessibilityLabel="Studio" placeholder="Nom du studio" placeholderTextColor={colors.textSecondary} value={studio} onChangeText={setStudio} style={[styles.studioInput, { color: colors.text, borderColor: colors.border }]} />
        </>}
      </ScrollView>{sheet === 'filters' && <TouchableOpacity onPress={() => setSheet(null)} style={[styles.applyButton, { backgroundColor: colors.buttonBg }]}><Text style={{ color: colors.buttonText, fontWeight: '700' }}>Voir les résultats</Text></TouchableOpacity>}</View></CustomModal>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '700' }, iconButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  search: { marginHorizontal: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 }, tab: { flex: 1, alignItems: 'center', paddingTop: 14, paddingBottom: 18, borderBottomWidth: 3 },
  toolbar: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  animeTitle: { fontSize: 16, marginTop: 10, lineHeight: 22 }, metadata: { fontSize: 12, lineHeight: 18, marginTop: 10 }, posterPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  genreGrid: { padding: 16, paddingBottom: 30 }, genreRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, genreTile: { overflow: 'hidden' }, genreContent: { justifyContent: 'center', alignItems: 'center', gap: 8, padding: 6 }, genreName: { color: '#fff', textAlign: 'center', fontSize: 13, fontWeight: '500' },
  activeFilters: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14 }, empty: { alignItems: 'center', paddingVertical: 70, paddingHorizontal: 24 }, emptyText: { textAlign: 'center', marginTop: 10, lineHeight: 22 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 18, paddingBottom: 12, borderTopWidth: 1 }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 }, sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12, marginTop: 20 }, sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15 }, studioInput: { borderWidth: 1, padding: 12, fontSize: 16 }, applyButton: { marginHorizontal: 16, marginTop: 16, padding: 15, alignItems: 'center' },
});
