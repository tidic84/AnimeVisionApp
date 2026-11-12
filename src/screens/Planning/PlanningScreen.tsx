import { radii } from '../../theme/shape';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabScreenProps } from '../../types/navigation';
import { PlanningDay, PlanningEntry } from '../../types/anime';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { useApi } from '../../contexts/ApiContext';
import { palette } from '../../theme/palette';
import apiService from '../../services/apiService';
import { SkeletonBlock, SkeletonGroup } from '../../components/SkeletonCard/SkeletonCard';
import { LoadingSwap } from '../../components/Motion';
import databaseService from '../../services/databaseService';
import { chapterLabel } from '../../services/comics';
import { ComicPlanningEntry, getComicPlanning, weekDay, weekStart } from '../../services/comics/planning';

const LANGUAGES = [{ key: 'all', label: 'Toutes' }, { key: 'vostfr', label: 'VOSTFR' }, { key: 'vf', label: 'VF' }];
// Le planning d'anime-sama commence le lundi (0) ; getDay() commence le dimanche.
const today = () => (new Date().getDay() + 6) % 7;
const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const timeOf = (at: string) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function PlanningScreen({ navigation }: MainTabScreenProps<'Planning'>) {
  const colors = palette[useAppColorScheme() ?? 'dark'];
  const insets = useSafeAreaInsets();
  const { isApiAvailable } = useApi();
  const [days, setDays] = useState<PlanningDay[]>([]);
  const [day, setDay] = useState(today());
  const [language, setLanguage] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  // Animes : planning d'anime-sama. Scans : séries suivies (favoris, lectures en cours).
  const [mode, setMode] = useState<'anime' | 'scans'>('anime');
  const [scans, setScans] = useState<ComicPlanningEntry[] | null>(null);
  const [scansLoading, setScansLoading] = useState(false);
  const loadScans = useCallback(async () => {
    setScansLoading(true);
    try {
      const [favorites, history] = await Promise.all([databaseService.getComicFavorites().catch(() => []), databaseService.getComicHistory().catch(() => [])]);
      setScans(await getComicPlanning([...history.map(entry => ({ comic: entry.comic, language: entry.language })), ...favorites.map(comic => ({ comic, language: 'fr' }))]));
    } catch { setScans([]); } finally { setScansLoading(false); }
  }, []);
  useEffect(() => { if (mode === 'scans' && scans === null) void loadScans(); }, [mode, scans, loadScans]);
  const monday = weekStart();
  const scanDays = DAY_NAMES.map((label, index) => ({ day: index, label, date: new Date(monday + index * 86_400_000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' }), entries: [] }));

  const load = useCallback(async (refresh = false) => {
    if (!isApiAvailable) { setLoading(false); return; }
    const token = ++request.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const planning = await apiService.getPlanning();
      if (token === request.current) setDays(planning);
    } catch {
      if (token === request.current) setError('Le planning ne peut pas être chargé. Appuyez pour réessayer.');
    } finally {
      if (token === request.current) { setLoading(false); setRefreshing(false); }
    }
  }, [isApiAvailable]);
  useEffect(() => { load(); }, [load]);

  const scanEntries = (scans || []).filter(entry => weekDay(entry.at, monday) === day);
  const renderScan = ({ item }: { item: ComicPlanningEntry }) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.comic.title}, ${chapterLabel(item.chapter)}, ${item.chapter.available ? '' : 'gratuit '}${item.upcoming ? 'prévu' : 'sorti'} à ${timeOf(item.at)}`} onPress={() => navigation.navigate('ComicDetail', { provider: item.comic.provider, comicId: item.comic.id })} style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.time}>
        <Text style={{ color: item.upcoming ? colors.text : colors.textSecondary, fontSize: 17, fontWeight: '700' }}>{timeOf(item.at)}</Text>
        {!item.upcoming && <Text style={{ color: colors.success, fontSize: 11, marginTop: 4 }}>Sorti</Text>}
      </View>
      {item.comic.coverThumb ? <Image source={{ uri: item.comic.coverThumb }} style={[styles.poster, { backgroundColor: colors.surface }]} resizeMode="cover" /> : <View style={[styles.poster, styles.posterPlaceholder, { backgroundColor: colors.surface }]}><Ionicons name="book-outline" size={22} color={colors.textSecondary} /></View>}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{item.comic.title}</Text>
        <Text numberOfLines={1} style={{ color: item.chapter.available ? colors.textSecondary : colors.premium, fontSize: 12, marginTop: 6 }}>{[chapterLabel(item.chapter), item.chapter.available ? null : 'Gratuit (premium avant)', item.chapter.group].filter(Boolean).join(' · ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );
  const selected = days.find(item => item.day === day);
  const entries = (selected?.entries || []).filter(entry => language === 'all' || entry.langue === language);
  const now = Date.now();

  const renderEntry = ({ item }: { item: PlanningEntry }) => {
    const aired = item.release_at ? new Date(item.release_at).getTime() <= now : false;
    const postponed = !item.release_at;
    const details = [item.episode ? `Épisode ${item.episode}` : null, item.season_label, item.langue.toUpperCase()].filter(Boolean).join(' · ');
    const open = () => item.anime_id && navigation.navigate('AnimeDetail', { animeId: String(item.anime_id) });
    return (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.title}${item.episode ? `, épisode ${item.episode}` : ''}, ${postponed ? 'reporté' : `à ${item.time}${aired ? ', sorti' : ''}`}, ${item.langue.toUpperCase()}`} disabled={!item.anime_id} onPress={open} style={[styles.row, { borderBottomColor: colors.border }]}>
        <View style={styles.time}>
          <Text style={{ color: postponed ? colors.warning : aired ? colors.textSecondary : colors.text, fontSize: 17, fontWeight: '700' }}>{postponed ? '—' : item.time}</Text>
          {aired && <Text style={{ color: colors.success, fontSize: 11, marginTop: 4 }}>Sorti</Text>}
        </View>
        {item.poster ? <Image source={{ uri: item.poster }} style={[styles.poster, { backgroundColor: colors.surface }]} resizeMode="cover" /> : <View style={[styles.poster, styles.posterPlaceholder, { backgroundColor: colors.surface }]}><Ionicons name="film-outline" size={22} color={colors.textSecondary} /></View>}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{item.title}</Text>
          <Text numberOfLines={1} style={{ color: postponed ? colors.warning : colors.textSecondary, fontSize: 12, marginTop: 6 }}>{details}</Text>
        </View>
        {item.anime_id ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
      </TouchableOpacity>
    );
  };

  // Même gabarit que l'écran chargé : barre des jours, filtres de langue, lignes heure/affiche/titre.
  const skeleton = <SkeletonGroup><View accessibilityLabel="Chargement du planning">
    <View style={styles.days}>{[0, 1, 2, 3, 4, 5, 6].map(key => <View key={key} style={{ flex: 1 }}><SkeletonBlock width="100%" height={54} /></View>)}</View>
    <View style={styles.languages}>{[66, 72, 44].map(width => <SkeletonBlock key={width} width={width} height={32} />)}</View>
    <View style={{ paddingHorizontal: 16 }}>{[0, 1, 2, 3, 4, 5].map(key => <View key={key} style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.time}><SkeletonBlock width={46} height={18} /></View>
      <SkeletonBlock width={56} height={80} />
      <View style={{ flex: 1, gap: 10 }}><SkeletonBlock width={key % 2 ? '60%' : '85%'} height={16} /><SkeletonBlock width="40%" height={12} /></View>
    </View>)}</View>
  </View></SkeletonGroup>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={styles.header}><Text style={[styles.title, { color: colors.text }]}>Planning</Text></View>
      <View style={styles.modes}>{([['anime', 'Animes'], ['scans', 'Scans']] as const).map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: mode === key }} onPress={() => setMode(key)} style={[styles.chip, { borderColor: mode === key ? colors.primary : colors.border, backgroundColor: mode === key ? colors.accentSoft : 'transparent' }]}><Text style={{ color: mode === key ? colors.primary : colors.text, fontWeight: '700', fontSize: 14 }}>{label}</Text></TouchableOpacity>)}</View>
      {mode === 'scans' ? <View style={{ flex: 1 }}>
        <View style={styles.days}>{scanDays.map(item => { const active = item.day === day; return <TouchableOpacity key={item.day} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${item.label} ${item.date}`} onPress={() => setDay(item.day)} style={[styles.day, { backgroundColor: active ? colors.buttonBg : colors.surface }]}><Text style={{ color: active ? colors.buttonText : colors.text, fontWeight: '700', fontSize: 13 }}>{item.label.slice(0, 3)}</Text><Text style={{ color: active ? colors.buttonText : colors.textSecondary, fontSize: 11, marginTop: 3 }}>{item.date}</Text>{item.day === today() && <View style={[styles.todayDot, { backgroundColor: active ? colors.buttonText : colors.primary }]} />}</TouchableOpacity>; })}</View>
        <Text style={{ color: colors.textTertiary, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 }}>Chapitres de vos séries suivies (favoris et lectures en cours) et sorties gratuites annoncées.</Text>
        <FlatList data={scanEntries} keyExtractor={item => `${item.comic.provider}-${item.chapter.id}`} renderItem={renderScan} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={scansLoading && scans !== null} onRefresh={() => void loadScans()} tintColor={colors.primary} />}
          ListEmptyComponent={scansLoading && scans === null ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : <View style={styles.empty}><Ionicons name="book-outline" size={42} color={colors.textSecondary} /><Text style={{ color: colors.text, fontSize: 18, marginTop: 14, textAlign: 'center' }}>Aucun chapitre ce jour-là</Text><Text style={{ color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>Ajoutez des séries en favori ou commencez une lecture pour suivre leurs sorties ici.</Text></View>} />
      </View> :
      <LoadingSwap loading={loading && !days.length} skeleton={skeleton} style={{ flex: 1 }}>
      {!days.length ? <View style={styles.empty}>
        <Ionicons name={isApiAvailable ? 'cloud-offline-outline' : 'calendar-outline'} size={42} color={colors.textSecondary} />
        <Text style={{ color: colors.text, fontSize: 18, marginTop: 14, textAlign: 'center' }}>{isApiAvailable ? 'Le planning ne peut pas être chargé' : 'Planning indisponible hors ligne'}</Text>
        {isApiAvailable && <TouchableOpacity accessibilityRole="button" onPress={() => load()} style={[styles.retry, { backgroundColor: colors.buttonBg }]}><Text style={{ color: colors.buttonText, fontWeight: '600' }}>Réessayer</Text></TouchableOpacity>}
      </View> : <>
      <View style={styles.days}>
        {days.map(item => {
          const active = item.day === day;
          return <TouchableOpacity key={item.day} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${item.label} ${item.date}`} onPress={() => setDay(item.day)} style={[styles.day, { backgroundColor: active ? colors.buttonBg : colors.surface }]}>
            <Text style={{ color: active ? colors.buttonText : colors.text, fontWeight: '700', fontSize: 13 }}>{item.label.slice(0, 3)}</Text>
            {!!item.date && <Text style={{ color: active ? colors.buttonText : colors.textSecondary, fontSize: 11, marginTop: 3 }}>{item.date}</Text>}
            {item.day === today() && <View style={[styles.todayDot, { backgroundColor: active ? colors.buttonText : colors.primary }]} />}
          </TouchableOpacity>;
        })}
      </View>
      <View style={styles.languages}>{LANGUAGES.map(option => <TouchableOpacity key={option.key} accessibilityRole="button" accessibilityState={{ selected: language === option.key }} onPress={() => setLanguage(option.key)} hitSlop={{ top: 7, bottom: 7 }} style={[styles.chip, { borderColor: language === option.key ? colors.primary : colors.border }]}><Text style={{ color: language === option.key ? colors.primary : colors.text, fontSize: 13 }}>{option.label}</Text></TouchableOpacity>)}</View>
      {!!error && <TouchableOpacity accessibilityRole="button" accessibilityHint="Touchez pour réessayer" onPress={() => load()} style={{ paddingHorizontal: 16, paddingVertical: 8 }}><Text style={{ color: colors.error }}>{error}</Text></TouchableOpacity>}
        <FlatList
          data={entries}
          keyExtractor={(item, index) => `${item.slug}-${item.langue}-${item.season_label}-${index}`}
          renderItem={renderEntry}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="calendar-outline" size={42} color={colors.textSecondary} /><Text style={{ color: colors.text, fontSize: 18, marginTop: 14 }}>Aucune sortie prévue</Text></View>}
        />
      </>}
      </LoadingSwap>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 }, modes: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 }, title: { fontSize: 26, fontWeight: '700' },
  days: { flexDirection: 'row', paddingHorizontal: 16, gap: 5, paddingBottom: 12 }, day: { flex: 1, borderRadius: radii.card, paddingVertical: 9, alignItems: 'center' }, todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  languages: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }, chip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  time: { width: 52, alignItems: 'flex-start' }, poster: { width: 56, height: 80, borderRadius: radii.card }, posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 70, paddingHorizontal: 24 }, retry: { borderRadius: radii.pill, paddingHorizontal: 22, paddingVertical: 12, marginTop: 20 },
});
