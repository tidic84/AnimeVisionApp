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
import { palette } from '../../theme/palette';
import { FadeIn, MotionPressable, LoadingSwap } from '../../components/Motion';
import { SkeletonBlock, SkeletonGroup } from '../../components/SkeletonCard/SkeletonCard';
import AnimeCard from '../../components/AnimeCard/AnimeCard';
import EpisodeCard from '../../components/EpisodeCard/EpisodeCard';
import ApiGuard from '../../components/ApiGuard';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import * as malSync from '../../services/mal/malSync';
import { clearContinueCache, getContinueWatching } from '../../services/continueWatching';
import { Anime, Episode, ScraperStatus } from '../../types/anime';
import { elapsedSince } from '../../utils/relativeTime';

type Shelf = { title: string; subtitle?: string; items: Anime[] };
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
  const [featured, setFeatured] = useState<Anime[]>([]);
  const [latest, setLatest] = useState<Episode[]>([]);
  const [resume, setResume] = useState<Episode[]>([]);
  const [watchlist, setWatchlist] = useState<Anime[]>([]);
  const [watchlistId, setWatchlistId] = useState<string | null>(null);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [scraper, setScraper] = useState<ScraperStatus | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerSolid, setHeaderSolid] = useState(false);
  const openAnime = (id: string) => navigation.navigate('AnimeDetail', { animeId: id });
  const openEpisode = (episode: Episode) => navigation.navigate('VideoPlayer', { episodeId: episode.id, animeId: episode.animeId, autoPlay: true });

  const loadPersonal = useCallback(async () => {
    try {
      // Tout l'historique : un animé fini doit revenir dès la sortie de l'épisode suivant, même ancien.
      const history = await databaseService.getWatchHistory(5000);
      const episodes = (await getContinueWatching(history)).map(item => item.episode);
      setResume(episodes);
      const lists = await databaseService.getAnimeLists();
      const defaultList = lists.find(l => l.isDefault);
      setWatchlistId(defaultList?.id ?? null);
      setWatchlist(defaultList ? await databaseService.getAnimesInList(defaultList.id) : []);
    } catch { /* Personal data may be unavailable while SQLite initializes. */ }
  }, []);
  useFocusEffect(useCallback(() => { void loadPersonal(); }, [loadPersonal]));
  const toggleWatchlist = async (anime: Anime) => {
    if (!watchlistId) return;
    try {
      await databaseService.saveAnime(anime);
      if (watchlist.some(item => item.id === anime.id)) await databaseService.removeAnimeFromList(watchlistId, anime.id);
      else { await databaseService.addAnimeToList(watchlistId, anime.id); void malSync.watchlistAdded(anime); }
      await loadPersonal();
    } catch { setError('Impossible de mettre à jour la Watchlist. Réessayez.'); }
  };

  const load = useCallback(async (refresh = false) => {
    setError('');
    if (refresh) { setRefreshing(true); clearContinueCache(); } else setLoading(true);
    void apiService.getScraperStatus().then(setScraper);
    try {
      const home = await apiService.getMobileHome();
      setFeatured(home.popular_animes.slice(0, 5));
      setLatest(home.latest_episodes);
      const requests = await Promise.allSettled([
        apiService.getTrendingAnimes(12),
        apiService.getLatestAnimes(12),
        apiService.getAnimesByGenre('Action', 12),
        apiService.getAnimesByGenre('Romance', 12),
        apiService.getAnimesByGenre('Aventure', 12),
      ]);
      const names = ['Tendances du moment', 'À découvrir', 'Place à l’action', 'Un peu de romance', 'L’aventure vous attend'];
      setShelves(requests.flatMap((result, index) => result.status === 'fulfilled' && result.value.length ? [{ title: names[index], items: result.value }] : []));
      await loadPersonal();
    } catch (e) { setError('Impossible de charger l’accueil. Vérifiez votre connexion, puis réessayez.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [loadPersonal]);
  useEffect(() => { void load(); }, [load]);

  const shelf = (title: string, items: Anime[], subtitle?: string) => items.length > 0 && (
    <FadeIn key={title} style={styles.section}>
      <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text></View>
      {subtitle && <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
      <FlatList horizontal data={items} keyExtractor={a => a.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} renderItem={({ item }) => <AnimeCard anime={item} size="medium" onPress={openAnime} />} />
    </FadeIn>
  );
  const episodes = (title: string, items: Episode[]) => items.length > 0 && (
    <FadeIn style={styles.section}>
      <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text></View>
      <FlatList horizontal data={items.slice(0, 12)} keyExtractor={e => e.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} renderItem={({ item }) => <EpisodeCard episode={item} onPress={openEpisode} />} />
    </FadeIn>
  );
  const heroHeight = Math.min(660, Math.max(470, height * .69));
  const barHeight = insets.top + 56;
  // The top bar is only a scrim over the hero; it turns opaque once the hero scrolls away.
  const solidFrom = Math.max(1, heroHeight - barHeight - 80);
  const solidTo = Math.max(solidFrom + 1, heroHeight - barHeight);
  const barOpacity = scrollY.interpolate({ inputRange: [solidFrom, solidTo], outputRange: [0, 1], extrapolate: 'clamp' });
  const barFade = barOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const hasHero = featured.length > 0 || loading;
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => setHeaderSolid(value >= solidTo));
    return () => scrollY.removeListener(id);
  }, [scrollY, solidTo]);
  const isSaved = (anime: Anime) => watchlist.some(item => item.id === anime.id);
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    {focused && <StatusBar style={headerSolid && scheme === 'light' ? 'dark' : 'light'} />}
    <Animated.ScrollView
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: Platform.OS !== 'web' })}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} progressViewOffset={barHeight} />}
      contentContainerStyle={{ paddingBottom: 28, paddingTop: hasHero ? 0 : barHeight }}>
      {error ? <View style={styles.error}><Text style={{ color: colors.textSecondary, textAlign: 'center' }}>{error}</Text><MotionPressable onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}><Text style={{ color: colors.primary }}>Réessayer</Text></MotionPressable></View> : null}
      <LoadingSwap loading={loading && !featured.length} skeleton={<SkeletonGroup><View style={{ height: heroHeight + 32, paddingHorizontal: 18 }}><SkeletonBlock height={heroHeight * .6} style={{ marginHorizontal: -18 }} /><View style={{ paddingTop: 22, gap: 12 }}><SkeletonBlock width="75%" height={37} /><SkeletonBlock width="55%" height={14} /><SkeletonBlock height={20} /><SkeletonBlock width="85%" height={20} /><SkeletonBlock width={220} height={46} /></View></View></SkeletonGroup>}>
      {featured.length > 0 && <View style={styles.hero}>
        <HeroCarousel items={featured} width={width} height={heroHeight} colors={colors} isInWatchlist={isSaved} watchlistEnabled={!!watchlistId} onOpen={openAnime} onToggleWatchlist={toggleWatchlist} />
      </View>}
      </LoadingSwap>
      {episodes('Reprendre', resume)}
      {shelves[0] && shelf(shelves[0].title, shelves[0].items)}
      {scraper?.stale && scraper.latest && <View style={[styles.staleBanner, { borderColor: colors.warning }]}>
        <Ionicons name="time-outline" size={18} color={colors.warning} />
        <Text style={[styles.staleText, { color: colors.textSecondary }]}>
          {scraper.latest.last_success_at
            ? `Les nouveaux épisodes ne sont plus mis à jour depuis ${elapsedSince(scraper.latest.last_success_at)}.`
            : 'Les nouveaux épisodes ne sont plus mis à jour pour le moment.'}
        </Text>
      </View>}
      {episodes('Nouveaux épisodes', latest)}
      {shelf('Votre Watchlist', watchlist)}
      {shelves.slice(1).map(s => shelf(s.title, s.items, s.subtitle))}
      <MotionPressable onPress={() => navigation.navigate('Catalog')} style={[styles.browse, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontWeight: '700' }}>EXPLORER TOUS LES ANIME</Text><Ionicons name="arrow-forward" size={20} color={colors.primary} /></MotionPressable>
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
  hero: { marginBottom: 28 },
  section: { marginBottom: 30 },
  sectionHeading: { paddingHorizontal: 18, marginBottom: 14 },
  sectionTitle: { fontSize: 21, fontWeight: '700' },
  sectionSubtitle: { paddingHorizontal: 18, marginBottom: 14, fontSize: 14 },
  row: { paddingHorizontal: 18 },
  staleBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, marginBottom: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.card, borderWidth: 1 },
  staleText: { flex: 1, fontSize: 13 },
  error: { padding: 28, alignItems: 'center', gap: 16 },
  retry: { borderRadius: radii.pill, borderWidth: 1, padding: 12 },
  browse: { borderRadius: radii.pill, borderWidth: 1, padding: 18, marginHorizontal: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
});
