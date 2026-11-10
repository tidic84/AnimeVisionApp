import { radii } from '../../theme/shape';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

const LANGUAGES = [{ key: 'all', label: 'Toutes' }, { key: 'vostfr', label: 'VOSTFR' }, { key: 'vf', label: 'VF' }];
// Le planning d'anime-sama commence le lundi (0) ; getDay() commence le dimanche.
const today = () => (new Date().getDay() + 6) % 7;

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
      </LoadingSwap>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 14 }, title: { fontSize: 26, fontWeight: '700' },
  days: { flexDirection: 'row', paddingHorizontal: 16, gap: 5, paddingBottom: 12 }, day: { flex: 1, borderRadius: radii.card, paddingVertical: 9, alignItems: 'center' }, todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  languages: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }, chip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  time: { width: 52, alignItems: 'flex-start' }, poster: { width: 56, height: 80, borderRadius: radii.card }, posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 70, paddingHorizontal: 24 }, retry: { borderRadius: radii.pill, paddingHorizontal: 22, paddingVertical: 12, marginTop: 20 },
});
