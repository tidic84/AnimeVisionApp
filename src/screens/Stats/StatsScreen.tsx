import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import databaseService from '../../services/databaseService';
import { FadeIn } from '../../components/Motion';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';
import { radii } from '../../theme/shape';
import { spacing, typography } from '../../theme/tokens';
import { RootStackScreenProps } from '../../types/navigation';
import { hitSlopFor, weeklyChartLabel } from '../../utils/accessibility';
import { createLogger } from '../../utils/logger';
import { computeWatchStats, formatDuration, plural, weekName, weekTick, WatchStats, DEFAULT_EPISODE_SECONDS } from '../../utils/watchStats';

const log = createLogger('Stats');
const BAR_HEIGHT = 120;

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; stats: WatchStats; empty: boolean };

export default function StatsScreen({ navigation }: RootStackScreenProps<'Stats'>) {
  const colors = palette[useAppColorScheme()];
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const rows = await databaseService.getWatchStatsRows();
      setState({ status: 'ready', stats: computeWatchStats(rows), empty: rows.length === 0 });
    } catch (error) {
      log.error('Impossible de calculer les statistiques', error);
      setState({ status: 'error' });
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const section = (title: string, children: React.ReactNode, delay = 0) => (
    <FadeIn delay={delay} style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </FadeIn>
  );
  const note = (text: string) => <Text style={[styles.note, { color: colors.textSecondary }]}>{text}</Text>;
  const message = (icon: React.ComponentProps<typeof Ionicons>['name'], title: string, text: string, action?: React.ReactNode) => (
    <View style={styles.message}>
      <Ionicons name={icon} size={48} color={colors.textTertiary} />
      <Text style={[styles.messageTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.messageText, { color: colors.textSecondary }]}>{text}</Text>
      {action}
    </View>
  );

  const renderStats = (stats: WatchStats) => {
    const time = formatDuration(stats.estimatedSeconds);
    const tiles = [
      { label: 'Temps regardé', value: `≈ ${time}`, spoken: `Temps regardé, environ ${time}` },
      { label: stats.episodesWatched > 1 ? 'Épisodes vus' : 'Épisode vu', value: String(stats.episodesWatched), spoken: plural(stats.episodesWatched, 'épisode vu', 'épisodes vus') },
      { label: stats.animesWatched > 1 ? 'Animés regardés' : 'Animé regardé', value: String(stats.animesWatched), spoken: plural(stats.animesWatched, 'animé regardé', 'animés regardés') },
      { label: 'En cours', value: String(stats.episodesInProgress), spoken: plural(stats.episodesInProgress, 'épisode commencé non terminé', 'épisodes commencés non terminés') },
    ];
    const highest = Math.max(1, ...stats.weeks.map(week => week.count));
    const topGenre = Math.max(1, ...stats.genres.map(genre => genre.episodes));
    const missingGenres = stats.animesWatched - stats.animesWithGenres;
    return (
      <>
        <FadeIn style={styles.tiles}>
          {tiles.map(tile => (
            <View key={tile.label} accessible accessibilityLabel={tile.spoken} style={[styles.tile, { backgroundColor: colors.surface }]}>
              <Text style={[styles.tileValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{tile.value}</Text>
              <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>{tile.label}</Text>
            </View>
          ))}
        </FadeIn>
        <View style={styles.section}>
          {note('Le temps regardé est une estimation : l’historique garde la progression de chaque épisode, pas le temps réellement passé devant. Un épisode marqué vu à la main compte en entier, et seul le dernier revisionnage d’un épisode est compté.')}
          {stats.assumedDurations > 0 && note(`Durée inconnue pour ${plural(stats.assumedDurations, 'épisode')} : ${DEFAULT_EPISODE_SECONDS / 60} min comptées par épisode.`)}
        </View>

        {section('Épisodes par semaine', (
          <>
            <View accessible accessibilityRole="image" accessibilityLabel={weeklyChartLabel(stats.weeks, weekName)} style={[styles.card, styles.chart, { backgroundColor: colors.surface }]}>
              {stats.weeks.map((week, index) => (
                <View key={week.start.getTime()} style={styles.column} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Text style={[styles.count, { color: week.count ? colors.text : colors.textTertiary }]}>{week.count}</Text>
                  <View style={styles.barArea}>
                    <View style={[styles.bar, week.count
                      ? { height: Math.max(4, Math.round(BAR_HEIGHT * week.count / highest)), backgroundColor: colors.primary, opacity: index === stats.weeks.length - 1 ? 1 : 0.7 }
                      : { height: 2, backgroundColor: colors.textTertiary }]} />
                  </View>
                  <Text style={[styles.tick, { color: colors.textSecondary }]} numberOfLines={1}>{weekTick(week.start)}</Text>
                </View>
              ))}
            </View>
            {note('Chaque barre est une semaine, repérée par son lundi ; la dernière est la semaine en cours. Un épisode compte dans la semaine où il a été vu pour la dernière fois.')}
          </>
        ), 60)}

        {section('Genres favoris', stats.genres.length ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {stats.genres.map(genre => (
                <View key={genre.genre} accessible accessibilityLabel={`${genre.genre}, ${plural(genre.episodes, 'épisode vu', 'épisodes vus')}, ${plural(genre.animes, 'animé')}`} style={styles.genre}>
                  <View style={styles.genreHeader}>
                    <Text style={[styles.genreName, { color: colors.text }]} numberOfLines={1}>{genre.genre}</Text>
                    <Text style={[styles.genreCount, { color: colors.textSecondary }]}>{plural(genre.episodes, 'épisode')} · {plural(genre.animes, 'animé')}</Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.surfaceElevated }]}>
                    <View style={[styles.trackFill, { width: `${Math.max(2, Math.round(100 * genre.episodes / topGenre))}%`, backgroundColor: colors.primary }]} />
                  </View>
                </View>
              ))}
            </View>
            {missingGenres > 0 && note(`Genres connus pour ${stats.animesWithGenres} des ${stats.animesWatched} animés regardés : la fiche des autres n’est plus enregistrée sur l’appareil.`)}
          </>
        ) : note(stats.episodesWatched
          ? 'Les genres des animés regardés ne sont plus enregistrés sur l’appareil. Ils reviendront en rouvrant leur fiche.'
          : 'Les genres favoris apparaîtront après un premier épisode terminé.'), 120)}
      </>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" onPress={() => navigation.goBack()} hitSlop={hitSlopFor(29)} style={styles.back}>
          <Ionicons name="chevron-back" size={29} color={colors.text} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Mes statistiques</Text>
      </View>
      {state.status === 'loading' ? <View style={styles.message}><ActivityIndicator color={colors.primary} accessibilityLabel="Calcul des statistiques" /></View>
        : state.status === 'error' ? message('alert-circle-outline', 'Statistiques indisponibles', 'L’historique n’a pas pu être lu sur cet appareil.', (
          <TouchableOpacity accessibilityRole="button" onPress={() => { setState({ status: 'loading' }); void load(); }} style={[styles.retry, { backgroundColor: colors.buttonBg }]}>
            <Text style={[styles.retryText, { color: colors.buttonText }]}>Réessayer</Text>
          </TouchableOpacity>
        ))
        : state.empty ? message('stats-chart-outline', 'Pas encore de statistiques', 'Regardez un épisode : votre temps de visionnage, vos épisodes par semaine et vos genres favoris apparaîtront ici.')
        : <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>{renderStats(state.stats)}</ScrollView>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.display, flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: radii.card, padding: spacing.md },
  tileValue: { ...typography.display },
  tileLabel: { ...typography.body, marginTop: spacing.xxs },
  section: { marginBottom: spacing.xl },
  sectionTitle: { ...typography.headline, marginBottom: spacing.sm },
  note: { ...typography.caption, fontWeight: '400', marginTop: spacing.xs },
  card: { borderRadius: radii.card, padding: spacing.md },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  column: { flex: 1, alignItems: 'center' },
  count: { ...typography.caption, marginBottom: spacing.xxs },
  barArea: { height: BAR_HEIGHT, alignSelf: 'stretch', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tick: { fontSize: 11, lineHeight: 16, marginTop: spacing.xxs },
  genre: { paddingVertical: spacing.xs },
  genreHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.xs, marginBottom: spacing.xxs + 2 },
  genreName: { ...typography.bodyStrong, flexShrink: 1 },
  genreCount: { ...typography.caption },
  track: { height: 8, borderRadius: radii.pill, overflow: 'hidden' },
  trackFill: { height: 8, borderRadius: radii.pill },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xs },
  messageTitle: { ...typography.headline, textAlign: 'center', marginTop: spacing.xs },
  messageText: { ...typography.body, textAlign: 'center' },
  retry: { marginTop: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  retryText: { ...typography.bodyStrong },
});
