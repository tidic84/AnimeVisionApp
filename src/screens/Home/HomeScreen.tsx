import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, ImageBackground, RefreshControl, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';
import { FadeIn, MotionPressable, LoadingSwap } from '../../components/Motion';
import { SkeletonBlock, SkeletonGroup } from '../../components/SkeletonCard/SkeletonCard';
import AnimeCard from '../../components/AnimeCard/AnimeCard';
import EpisodeCard from '../../components/EpisodeCard/EpisodeCard';
import ApiGuard from '../../components/ApiGuard';
import hybridScrapingService from '../../services/hybridScrapingService';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import { Anime, Episode } from '../../types/anime';

type Shelf = { title: string; subtitle?: string; items: Anime[] };
export default function HomeScreen() {
  return <ApiGuard><HomeContent /></ApiGuard>;
}
function HomeContent() {
  const navigation = useNavigation<any>();
  const colors = palette[useAppColorScheme()];
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
  const [slide, setSlide] = useState(0);
  const openAnime = (id: string) => navigation.navigate('AnimeDetail', { animeId: id });
  const openEpisode = (episode: Episode) => navigation.navigate('VideoPlayer', { episodeId: episode.id, animeId: episode.animeId, autoPlay: true });

  const loadPersonal = useCallback(async () => {
    try {
      const history = await databaseService.getWatchHistory(20);
      const episodes = await Promise.all(history.filter(h => h.progress > 0 && h.progress < 90).slice(0, 8).map(async h => {
        const stored = (await databaseService.getAnimeEpisodes(h.animeId)).find(e => e.id === h.episodeId);
        const episode = stored || await apiService.getEpisodeById(h.episodeId);
        return { ...episode, watchProgress: h.progress };
      }));
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
      else await databaseService.addAnimeToList(watchlistId, anime.id);
      await loadPersonal();
    } catch { setError('Impossible de mettre à jour la Watchlist. Réessayez.'); }
  };

  const load = useCallback(async (refresh = false) => {
    setError('');
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const home = await (refresh ? hybridScrapingService.forceRefresh() : hybridScrapingService.getMobileHome());
      setFeatured(home.popularAnimes.slice(0, 5));
      setLatest(home.latestEpisodes);
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
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />} contentContainerStyle={{ paddingBottom: 28 }}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.brand}><Ionicons name="play-circle" size={30} color={colors.primary} /><Text style={[styles.brandText, { color: colors.text }]}>animevision</Text></View>
        <MotionPressable accessibilityLabel="Rechercher un anime" onPress={() => navigation.navigate('Catalog')} style={styles.search}><Ionicons name="search-outline" size={27} color={colors.text} /></MotionPressable>
      </View>
      {error ? <View style={styles.error}><Text style={{ color: colors.textSecondary, textAlign: 'center' }}>{error}</Text><MotionPressable onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}><Text style={{ color: colors.primary }}>Réessayer</Text></MotionPressable></View> : null}
      <LoadingSwap loading={loading && !featured.length} skeleton={<SkeletonGroup><View style={{ height: heroHeight + 32, paddingHorizontal: 18 }}><SkeletonBlock height={heroHeight * .6} style={{ marginHorizontal: -18 }} /><View style={{ paddingTop: 22, gap: 12 }}><SkeletonBlock width="75%" height={37} /><SkeletonBlock width="55%" height={14} /><SkeletonBlock height={20} /><SkeletonBlock width="85%" height={20} /><SkeletonBlock width={220} height={46} /></View></View></SkeletonGroup>}>
      {featured.length > 0 && <View style={styles.hero}>
        <FlatList horizontal pagingEnabled data={featured} keyExtractor={a => a.id} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={e => setSlide(Math.round(e.nativeEvent.contentOffset.x / width))} renderItem={({ item: anime }) => (
          <ImageBackground source={{ uri: anime.banner || anime.thumbnail }} style={{ width, height: heroHeight }} resizeMode="cover" fadeDuration={280}>
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,.18)', '#000000']} locations={[0, .35, .79]} style={styles.heroGradient}>
              <FadeIn style={styles.heroContent}>
                <Text style={styles.heroTitle} numberOfLines={2}>{anime.title}</Text>
                <Text style={styles.heroMetadata}>{[anime.year > 1900 ? String(anime.year) : '', ...anime.genres.slice(0, 3)].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.heroDescription} numberOfLines={3}>{anime.synopsis.replace(/<[^>]*>/g, '').trim()}</Text>
                <View style={styles.actions}>
                  <MotionPressable onPress={() => openAnime(anime.id)} accessibilityLabel={`Découvrir ${anime.title}`} style={[styles.heroButton, { backgroundColor: colors.buttonBg }]}><Ionicons name="play" size={20} color={colors.buttonText} /><Text style={[styles.heroButtonText, { color: colors.buttonText }]}>Découvrir l’anime</Text></MotionPressable>
                  <MotionPressable disabled={!watchlistId} onPress={() => toggleWatchlist(anime)} accessibilityLabel={`${watchlist.some(item => item.id === anime.id) ? "Retirer" : "Ajouter"} ${anime.title} ${watchlist.some(item => item.id === anime.id) ? "de" : "à"} la Watchlist`} style={[styles.heroInfo, { borderColor: colors.primary }]}><Ionicons name={watchlist.some(item => item.id === anime.id) ? "bookmark" : "bookmark-outline"} size={24} color={colors.primary} /></MotionPressable>
                </View>
              </FadeIn>
            </LinearGradient>
          </ImageBackground>
        )} />
        <View style={styles.dots}>{featured.map((a, index) => <View key={a.id} style={{ width: index === slide ? 30 : 18, height: 4, backgroundColor: index === slide ? colors.primary : '#646467', borderRadius: 2 }} />)}</View>
      </View>}
      </LoadingSwap>
      {episodes('Reprendre', resume)}
      {shelves[0] && shelf(shelves[0].title, shelves[0].items)}
      {episodes('Nouveaux épisodes', latest)}
      {shelf('Votre Watchlist', watchlist)}
      {shelves.slice(1).map(s => shelf(s.title, s.items, s.subtitle))}
      <MotionPressable onPress={() => navigation.navigate('Catalog')} style={[styles.browse, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontWeight: '700' }}>EXPLORER TOUS LES ANIME</Text><Ionicons name="arrow-forward" size={20} color={colors.primary} /></MotionPressable>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandText: { fontSize: 21, fontWeight: '700', letterSpacing: -.8 },
  search: { padding: 8 },
  hero: { marginBottom: 28 },
  heroGradient: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 34 },
  heroContent: { gap: 12, maxWidth: 700 },
  heroTitle: { color: '#FFF', fontSize: 32, fontWeight: '800', lineHeight: 37, textShadowColor: '#000', textShadowRadius: 6 },
  heroMetadata: { color: '#AAA', fontSize: 12 },
  heroDescription: { color: '#DDD', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroButton: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 17, height: 46, borderRadius: 3 },
  heroButtonText: { color: '#000', fontSize: 14, fontWeight: '700' },
  heroInfo: { height: 46, width: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 3 },
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: 18 },
  section: { marginBottom: 30 },
  sectionHeading: { paddingHorizontal: 18, marginBottom: 14 },
  sectionTitle: { fontSize: 21, fontWeight: '700' },
  sectionSubtitle: { paddingHorizontal: 18, marginBottom: 14, fontSize: 14 },
  row: { paddingHorizontal: 18 },
  error: { padding: 28, alignItems: 'center', gap: 16 },
  retry: { borderWidth: 1, padding: 12 },
  browse: { borderWidth: 1, padding: 18, marginHorizontal: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
});
