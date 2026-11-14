import { radii } from '../../theme/shape';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, FlatList, RefreshControl, Platform, useWindowDimensions } from 'react-native';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import HeroCarousel from './HeroCarousel';
import { HeroSkeleton, RowSkeleton, TitleSkeleton } from './HomeSkeletons';
import { palette } from '../../theme/palette';
import { MotionPressable, LoadingSwap } from '../../components/Motion';
import AnimeCard from '../../components/AnimeCard/AnimeCard';
import EpisodeCard from '../../components/EpisodeCard/EpisodeCard';
import ApiGuard from '../../components/ApiGuard';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import * as malSync from '../../services/mal/malSync';
import { clearContinueCache, getContinueWatching } from '../../services/continueWatching';
import { clearRecommendationsCache, getRecommendationShelf, RecommendationShelf } from '../../services/recommendations';
import { GenreShelf, getGenreShelves, SHELF_COUNT } from '../../services/homeShelves';
import { Anime, Episode, ScraperStatus } from '../../types/anime';
import { elapsedSince } from '../../utils/relativeTime';
import SectionHeader from '../../components/SectionHeader';
import { gutterFor } from '../../theme/tokens';

/** `undefined` while a section is loading (it shows its skeleton), `[]` once it turned out empty (it is hidden). */
type Loaded<T> = T[] | undefined;
export default function HomeScreen() {
  return <ApiGuard><HomeContent /></ApiGuard>;
}
function HomeContent() {
  const navigation = useNavigation<any>();
  const scheme = useAppColorScheme();
  const colors = palette[scheme];
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [featured, setFeatured] = useState<Loaded<Anime>>();
  const [latest, setLatest] = useState<Loaded<Episode>>();
  const [trending, setTrending] = useState<Loaded<Anime>>();
  const [discover, setDiscover] = useState<Loaded<Anime>>();
  const [genres, setGenres] = useState<GenreShelf[]>();
  const [genreItems, setGenreItems] = useState<Record<string, Anime[]>>({});
  const [resume, setResume] = useState<Loaded<Episode>>();
  const [watchlist, setWatchlist] = useState<Loaded<Anime>>();
  const [watchlistId, setWatchlistId] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<RecommendationShelf | null | undefined>();
  const recommendedEpoch = useRef(0);
  const loadEpoch = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // undefined tant que l'état du scraper n'est pas connu : son bandeau fait partie de la section « Nouveaux épisodes ».
  const [scraper, setScraper] = useState<ScraperStatus | null | undefined>();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerSolid, setHeaderSolid] = useState(false);
  const openAnime = (id: string) => navigation.navigate('AnimeDetail', { animeId: id });
  const openEpisode = (episode: Episode) => navigation.navigate('VideoPlayer', { episodeId: episode.id, animeId: episode.animeId, autoPlay: true });

  const loadWatchlist = useCallback(async () => {
    const lists = await databaseService.getAnimeLists();
    const defaultList = lists.find(l => l.isDefault);
    setWatchlistId(defaultList?.id ?? null);
    setWatchlist(defaultList ? await databaseService.getAnimesInList(defaultList.id) : []);
  }, []);
  const loadPersonal = useCallback(async () => {
    // Chaque section personnelle se remplit dès que ses données sont prêtes, sans attendre les autres.
    void loadWatchlist().catch(() => setWatchlist(previous => previous ?? []));
    try {
      // Tout l'historique : un animé fini doit revenir dès la sortie de l'épisode suivant, même ancien.
      const history = await databaseService.getWatchHistory(5000);
      // Sans attendre : l'étagère de recommandations arrive quand elle est prête, ou pas du tout.
      const token = ++recommendedEpoch.current;
      void Promise.all([databaseService.getAnimeLists(), databaseService.getTrackedAnimeIds()])
        .then(([all, tracked]) => getRecommendationShelf(history, [...all.flatMap(l => l.animeIds), ...tracked]))
        .catch(() => null)
        .then(result => { if (token === recommendedEpoch.current) setRecommended(result); });
      setResume(history.length ? (await getContinueWatching(history)).map(item => item.episode) : []);
    } catch {
      // Personal data may be unavailable while SQLite initializes.
      setResume(previous => previous ?? []);
      setRecommended(previous => previous === undefined ? null : previous);
    }
  }, [loadWatchlist]);
  useFocusEffect(useCallback(() => { void loadPersonal(); }, [loadPersonal]));
  const toggleWatchlist = async (anime: Anime) => {
    if (!watchlistId) return;
    try {
      await databaseService.saveAnime(anime);
      if (watchlist?.some(item => item.id === anime.id)) await databaseService.removeAnimeFromList(watchlistId, anime.id);
      else { await databaseService.addAnimeToList(watchlistId, anime.id); void malSync.watchlistAdded(anime); }
      await loadWatchlist();
    } catch { setError('Impossible de mettre à jour la Watchlist. Réessayez.'); }
  };

  const load = useCallback(async (refresh = false) => {
    const token = ++loadEpoch.current;
    const current = () => token === loadEpoch.current;
    setError('');
    if (refresh) { setRefreshing(true); clearContinueCache(); clearRecommendationsCache(); void loadPersonal(); }
    // Chaque section a sa requête et se remplit à sa place. Une section déjà affichée garde
    // son contenu si son rafraîchissement échoue ; jamais chargée, elle disparaît.
    const fill = <T,>(request: Promise<T[]>, set: React.Dispatch<React.SetStateAction<Loaded<T>>>) => request.then(
      value => { if (current()) set(value); return true; },
      () => { if (current()) set(previous => previous ?? []); return false; },
    );
    // Lancées dans l'ordre d'affichage : le planificateur (deux requêtes à la fois) sert d'abord le haut de l'écran.
    // Carrousel : sélection d'anime-sama ; à défaut, les plus populaires.
    const hero = fill(apiService.getFeaturedAnimes(8).catch(() => [] as Anime[]).then(picks => picks.length ? picks : apiService.getPopularAnimes(5)), setFeatured);
    const top = fill(apiService.getTrendingAnimes(12), setTrending);
    const status = apiService.getScraperStatus().then(value => { if (current()) setScraper(value); });
    const episodes = fill(apiService.getLatestEpisodes(20, 'vostfr'), setLatest);
    const more = fill(apiService.getLatestAnimes(12), setDiscover);
    // Étagères par genre : lecture SQLite locale, puis une requête par genre.
    const byGenre = getGenreShelves().then(async picked => {
      if (!current()) return;
      setGenres(picked);
      await Promise.all(picked.map(({ genre }) => apiService.getAnimesByGenre(genre, 12).then(
        items => { if (current()) setGenreItems(previous => ({ ...previous, [genre]: items })); },
        () => { if (current()) setGenreItems(previous => previous[genre] ? previous : { ...previous, [genre]: [] }); },
      )));
    });
    const [heroOk, topOk, episodesOk] = await Promise.all([hero, top, episodes, more, status, byGenre]);
    if (!current()) return;
    if (!heroOk && !topOk && !episodesOk) setError('Impossible de charger l’accueil. Vérifiez votre connexion, puis réessayez.');
    setRefreshing(false);
  }, [loadPersonal]);
  useEffect(() => { void load(); }, [load]);

  // Une section en chargement réserve sa place (titre + rangée de cartes fantômes), puis se remplit sur place.
  const heading = (title?: string, subtitle?: string) => title ? <SectionHeader title={title} subtitle={subtitle} gutter={gutter} /> : <TitleSkeleton gutter={gutter} />;
  const rowStyle = () => ({ paddingHorizontal: gutter, paddingVertical: 6 });
  const shelf = (key: string, title: string | undefined, items: Loaded<Anime>, subtitle?: string) => items?.length === 0 ? null : (
    <View key={key} style={styles.section}>
      {heading(title, subtitle)}
      <LoadingSwap loading={!items} skeleton={<RowSkeleton kind="anime" width={width} gutter={gutter} />}>
        {items && <FlatList horizontal data={items} keyExtractor={a => a.id} showsHorizontalScrollIndicator={false} contentContainerStyle={rowStyle()} renderItem={({ item }) => <AnimeCard anime={item} size="medium" onPress={openAnime} />} />}
      </LoadingSwap>
    </View>
  );
  const episodeShelf = (title: string, items: Loaded<Episode>, banner?: React.ReactNode) => items?.length === 0 ? null : (
    <View style={styles.section}>
      {items && banner}
      {heading(title)}
      <LoadingSwap loading={!items} skeleton={<RowSkeleton kind="episode" width={width} gutter={gutter} />}>
        {items && <FlatList horizontal data={items.slice(0, 12)} keyExtractor={e => e.id} showsHorizontalScrollIndicator={false} contentContainerStyle={rowStyle()} renderItem={({ item }) => <EpisodeCard episode={item} onPress={openEpisode} />} />}
      </LoadingSwap>
    </View>
  );
  const gutter = gutterFor(width);
  const heroHeight = Math.min(660, Math.max(470, height * .69));
  const barHeight = insets.top + 56;
  // The top bar is only a scrim over the hero; it turns opaque once the hero scrolls away.
  const solidFrom = Math.max(1, heroHeight - barHeight - 80);
  const solidTo = Math.max(solidFrom + 1, heroHeight - barHeight);
  const barOpacity = scrollY.interpolate({ inputRange: [solidFrom, solidTo], outputRange: [0, 1], extrapolate: 'clamp' });
  const barFade = barOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const hasHero = featured === undefined || featured.length > 0;
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => setHeaderSolid(value >= solidTo));
    return () => scrollY.removeListener(id);
  }, [scrollY, solidTo]);
  const isSaved = (anime: Anime) => !!watchlist?.some(item => item.id === anime.id);
  const staleBanner = scraper?.stale && scraper.latest ? <View style={[styles.staleBanner, { borderColor: colors.warning, marginHorizontal: gutter }]}>
    <Ionicons name="time-outline" size={18} color={colors.warning} />
    <Text style={[styles.staleText, { color: colors.textSecondary }]}>
      {scraper.latest.last_success_at
        ? `Les nouveaux épisodes ne sont plus mis à jour depuis ${elapsedSince(scraper.latest.last_success_at)}.`
        : 'Les nouveaux épisodes ne sont plus mis à jour pour le moment.'}
    </Text>
  </View> : null;
  // Tant que la liste des genres n'est pas connue, les étagères par genre gardent leur place sans titre.
  const genreShelves = genres ?? Array.from({ length: SHELF_COUNT }, () => undefined);
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    {focused && <StatusBar style={headerSolid && scheme === 'light' ? 'dark' : 'light'} />}
    <Animated.ScrollView
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: Platform.OS !== 'web' })}
      scrollEventThrottle={16}
      // Une section qui disparaît au-dessus de l'écran ne fait pas sauter ce que l'on regarde (le carrousel visible n'est pas concerné).
      maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} progressViewOffset={barHeight} />}
      contentContainerStyle={{ paddingBottom: 28, paddingTop: hasHero ? 0 : barHeight }}>
      {hasHero && <View style={styles.hero}>
        <LoadingSwap loading={!featured} skeleton={<HeroSkeleton width={width} height={heroHeight} gutter={gutter} />}>
          {!!featured?.length && <HeroCarousel items={featured} width={width} height={heroHeight} gutter={gutter} colors={colors} resumeFor={anime => resume?.find(episode => episode.animeId === anime.id)} onResume={openEpisode} isInWatchlist={isSaved} watchlistEnabled={!!watchlistId} onOpen={openAnime} onToggleWatchlist={toggleWatchlist} />}
        </LoadingSwap>
      </View>}
      {error ? <View style={styles.error}><Text style={{ color: colors.textSecondary, textAlign: 'center' }}>{error}</Text><MotionPressable onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}><Text style={{ color: colors.primary }}>Réessayer</Text></MotionPressable></View> : null}
      {episodeShelf('Continuer', resume)}
      {shelf('trending', 'Tendances', trending)}
      {episodeShelf('Nouveautés', scraper === undefined ? undefined : latest, staleBanner)}
      {shelf('watchlist', 'Votre Watchlist', watchlist)}
      {recommended !== null && shelf('recommended', recommended?.title, recommended?.items)}
      {shelf('discover', 'À découvrir', discover)}
      {genreShelves.map((genre, index) => shelf(`genre-${index}`, genre?.title, genre ? genreItems[genre.genre] : undefined))}
      <MotionPressable accessibilityLabel="Explorer tous les animés" onPress={() => navigation.navigate('Catalog')} style={[styles.browse, { borderColor: colors.primary, marginHorizontal: gutter }]}><Text style={{ color: colors.primary, fontWeight: '700' }}>Explorer tous les animés</Text><Ionicons name="arrow-forward" size={20} color={colors.primary} /></MotionPressable>
    </Animated.ScrollView>
    <View pointerEvents="box-none" style={[styles.topBar, { height: barHeight + 40 }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: barFade }]}><LinearGradient colors={['rgba(0,0,0,.6)', 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} /></Animated.View>
      <Animated.View pointerEvents="none" style={[styles.topBarFill, { height: barHeight, backgroundColor: colors.background, opacity: barOpacity }]} />
      <View pointerEvents="box-none" style={[styles.topBarRow, { paddingTop: insets.top, height: barHeight }]}>
        <MotionPressable accessibilityLabel="Rechercher un anime" onPress={() => navigation.navigate('Catalog')} style={styles.search}>
          <Ionicons name="search-outline" size={27} color="#FFF" />
          <Animated.View pointerEvents="none" style={[styles.searchSolid, { opacity: barOpacity }]}><Ionicons name="search-outline" size={27} color={colors.text} /></Animated.View>
        </MotionPressable>
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarFill: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarRow: { paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  search: { borderRadius: radii.pill, padding: 8 },
  searchSolid: { position: 'absolute', top: 8, left: 8 },
  hero: { marginBottom: 32 },
  section: { marginBottom: 36 },
  staleBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.card, borderWidth: 1 },
  staleText: { flex: 1, fontSize: 13 },
  error: { padding: 28, alignItems: 'center', gap: 16 },
  retry: { borderRadius: radii.pill, borderWidth: 1, padding: 12 },
  browse: { borderRadius: radii.pill, borderWidth: 1, padding: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
});
