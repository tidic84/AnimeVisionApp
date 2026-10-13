import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackScreenProps } from '../../types/navigation';
import { Anime, DownloadStatus, Episode, Season, VideoQuality } from '../../types/anime';
import { palette } from '../../theme/palette';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import downloadService from '../../services/downloadService';
import CustomModal from '../../components/CustomModal';
import { SkeletonBlock, SkeletonGroup } from '../../components/SkeletonCard/SkeletonCard';
import { LoadingSwap } from '../../components/Motion';

const seasonTitle = (season: Season) => season.titre_saison?.trim() || (season.num_saison > 0 && season.num_saison < 100 ? `Saison ${season.num_saison}` : season.type || 'Épisodes');
const episodeLanguage = (episode: Episode) => episode.langue?.toUpperCase() || [...new Set((episode.streaming_servers || []).map(server => server.langue?.toUpperCase()).filter(Boolean))].join(' / ');
const mergeLocal = (episode: Episode, cached?: Episode): Episode => ({ ...episode, watchProgress: cached?.watchProgress ?? episode.watchProgress, isWatched: cached?.isWatched ?? episode.isWatched, downloadStatus: cached?.downloadStatus ?? episode.downloadStatus });

export default function AnimeDetailScreen({ navigation, route }: RootStackScreenProps<'AnimeDetail'>) {
  const { animeId } = route.params;
  const colors = palette[useAppColorScheme() ?? 'dark'];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const heroHeight = Math.min(560, width * 1.25);
  const [anime, setAnime] = useState<Anime | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [similar, setSimilar] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [error, setError] = useState('');
  const [episodeError, setEpisodeError] = useState('');
  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'episodes' | 'similar'>('episodes');
  const [showSeasons, setShowSeasons] = useState(false);
  const [descending, setDescending] = useState(false);
  const [language, setLanguage] = useState('all');
  const [episodeLimit, setEpisodeLimit] = useState(24);
  const [resumeId, setResumeId] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const detailEpoch = useRef(0);
  const seasonEpoch = useRef(0);
  const persistenceEpoch = useRef(0);

  const loadDetails = async () => {
    const token = ++detailEpoch.current;
    seasonEpoch.current += 1;
    setLoading(true);
    setError('');
    setEpisodeError('');
    setAnime(null);
    setEpisodes([]);
    setSeasons([]);
    setSeasonId('');
    setResumeId('');
    setSimilar([]);
    setEpisodesLoading(true);
    setLanguage('all');
    setExpanded(false);
    try {
      const [detailsResult, seasonsResult, cachedResult, historyResult, listsResult] = await Promise.allSettled([
        apiService.getAnimeDetails(animeId), apiService.getAnimeSeasons(animeId), databaseService.getAnimeEpisodes(animeId), databaseService.getWatchHistory(1000), databaseService.getAnimeLists(),
      ]);
      const details = detailsResult.status === 'fulfilled' ? detailsResult.value : await databaseService.getAnime(animeId);
      if (token !== detailEpoch.current) return;
      if (!details) throw new Error('Cette fiche ne peut pas être chargée. Vérifiez votre connexion.');
      setAnime(details);
      setLoading(false);
      await databaseService.saveAnime(details).catch(() => {});
      if (token !== detailEpoch.current) return;
      const availableSeasons = seasonsResult.status === 'fulfilled' ? seasonsResult.value : [];
      setSeasons(availableSeasons);
      if (listsResult.status === 'fulfilled') setInWatchlist(Boolean(listsResult.value.find(list => list.isDefault)?.animeIds.includes(animeId)));
      const lastWatched = historyResult.status === 'fulfilled' ? historyResult.value.find(entry => entry.animeId === animeId && entry.progress > 0 && entry.progress < 95) : undefined;
      let preferredSeason = availableSeasons[0]?.id || '';
      if (lastWatched) {
        setResumeId(lastWatched.episodeId);
        try {
          const episode = await apiService.getEpisodeById(lastWatched.episodeId);
          if (token !== detailEpoch.current) return;
          if (availableSeasons.some(season => season.id === episode.saison_id)) preferredSeason = episode.saison_id!;
        } catch { /* Cached history still allows the player to resume directly. */ }
      }
      if (token !== detailEpoch.current) return;
      if (preferredSeason) setSeasonId(preferredSeason);
      else {
        setEpisodes(cachedResult.status === 'fulfilled' ? cachedResult.value : []);
        setEpisodesLoading(false);
        if (seasonsResult.status === 'rejected') setEpisodeError('Les saisons sont indisponibles. Les épisodes enregistrés localement restent accessibles.');
      }
      if (details.genres.length) {
        apiService.getAnimesByGenre(details.genres[0], 12).then(items => {
          if (token === detailEpoch.current) setSimilar(items.filter(item => item.id !== animeId));
        }).catch(() => { if (token === detailEpoch.current) setSimilar([]); });
      } else setSimilar([]);
    } catch (cause) { if (token === detailEpoch.current) setError(cause instanceof Error ? cause.message : 'Impossible de charger la fiche.'); }
    finally { if (token === detailEpoch.current) setLoading(false); }
  };
  useEffect(() => {
    loadDetails();
    return () => { detailEpoch.current += 1; seasonEpoch.current += 1; persistenceEpoch.current += 1; };
  }, [animeId]);

  const loadSeason = async (selected: string) => {
    const token = ++seasonEpoch.current;
    setEpisodesLoading(true);
    setEpisodeError('');
    setEpisodes([]);
    try {
      const [remote, cached] = await Promise.all([apiService.getSeasonEpisodes(selected, animeId), databaseService.getAnimeEpisodes(animeId)]);
      if (token !== seasonEpoch.current) return;
      const saved = new Map(cached.map(episode => [episode.id, episode]));
      const merged = remote.map(episode => mergeLocal({ ...episode, animeTitle: anime?.title || episode.animeTitle }, saved.get(episode.id)));
      setEpisodes(merged);
      setEpisodesLoading(false);
      const persistenceToken = ++persistenceEpoch.current;
      // Render immediately; only new episodes need background persistence.
      // Existing records keep their current playback/download state.
      for (const episode of merged.filter(item => !saved.has(item.id))) {
        if (token !== seasonEpoch.current || persistenceToken !== persistenceEpoch.current) return;
        await databaseService.saveEpisode(episode).catch(() => {});
      }
    } catch { if (token === seasonEpoch.current) setEpisodeError('Les épisodes ne peuvent pas être chargés. Appuyez pour réessayer.'); }
    finally { if (token === seasonEpoch.current) setEpisodesLoading(false); }
  };
  useEffect(() => {
    if (seasonId) loadSeason(seasonId);
    return () => { seasonEpoch.current += 1; };
  }, [seasonId, animeId]);
  useEffect(() => { setEpisodeLimit(24); }, [animeId, seasonId, language, descending]);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([databaseService.getAnimeEpisodes(animeId), databaseService.getWatchHistory(1000)]).then(([cached, history]) => {
      if (!active) return;
      const map = new Map(cached.map(episode => [episode.id, episode]));
      setEpisodes(previous => previous.map(episode => mergeLocal(episode, map.get(episode.id))));
      setResumeId(history.find(entry => entry.animeId === animeId && entry.progress > 0 && entry.progress < 95)?.episodeId || '');
    }).catch(() => {});
    return () => { active = false; };
  }, [animeId]));

  const toggleWatchlist = async () => {
    if (!anime || watchlistBusy) return;
    setWatchlistBusy(true);
    try {
      await databaseService.saveAnime(anime);
      const lists = await databaseService.getAnimeLists();
      const defaultList = lists.find(list => list.isDefault);
      if (!defaultList) throw new Error('La watchlist ne peut pas être chargée.');
      if (inWatchlist) await databaseService.removeAnimeFromList(defaultList.id, animeId);
      else await databaseService.addAnimeToList(defaultList.id, animeId);
      setInWatchlist(value => !value);
    } catch { Alert.alert('Watchlist', 'Impossible de modifier votre liste. Réessayez.'); }
    finally { setWatchlistBusy(false); }
  };
  const play = async (episodeId: string) => {
    try {
      persistenceEpoch.current += 1;
      const cached = (await databaseService.getAnimeEpisodes(animeId)).find(episode => episode.id === episodeId);
      const selected = episodes.find(episode => episode.id === episodeId) || cached || await apiService.getEpisodeById(episodeId);
      await databaseService.saveEpisode(mergeLocal(selected, cached));
      navigation.navigate('VideoPlayer', { episodeId, animeId, autoPlay: true });
    } catch { Alert.alert('Lecture', 'Impossible de préparer cet épisode. Réessayez.'); }
  };
  const enqueueDownload = async (episode: Episode) => {
    if (!episode.streamingUrls.length && !(episode.streaming_servers || []).length) throw new Error('Aucun serveur disponible pour cet épisode.');
    const quality = episode.streamingUrls.some(source => source.quality === VideoQuality.HIGH) ? VideoQuality.HIGH : episode.streamingUrls[0]?.quality || VideoQuality.HIGH;
    await downloadService.startDownload(episode, quality, progress => {
      const status = progress.status === 'completed' ? DownloadStatus.DOWNLOADED : progress.status === 'error' ? DownloadStatus.FAILED : DownloadStatus.DOWNLOADING;
      setEpisodes(previous => previous.map(item => item.id === episode.id ? { ...item, downloadStatus: status } : item));
    });
    const downloads = await downloadService.getAllDownloads();
    const item = downloads.find(download => download.episode.id === episode.id);
    if (item) setEpisodes(previous => previous.map(existing => existing.id === episode.id ? { ...existing, downloadStatus: item.status } : existing));
  };
  const download = async (episode: Episode) => {
    try {
      if (episode.downloadStatus === DownloadStatus.DOWNLOADED) {
        const cached = (await downloadService.getAllDownloads()).find(item => item.episode.id === episode.id && item.status === DownloadStatus.DOWNLOADED && item.filePath);
        if (cached?.filePath) navigation.navigate('VideoPlayer', { animeId, episodeId: episode.id, autoPlay: true, isOfflineMode: true, localFilePath: cached.filePath });
        else play(episode.id);
        return;
      }
      if (episode.downloadStatus === DownloadStatus.DOWNLOADING) return;
      if (episode.downloadStatus === DownloadStatus.QUEUED) {
        await downloadService.cancelDownload(episode.id);
        setEpisodes(previous => previous.map(item => item.id === episode.id ? { ...item, downloadStatus: DownloadStatus.NOT_DOWNLOADED } : item));
        return;
      }
      await enqueueDownload(episode);
    } catch (cause) { Alert.alert('Téléchargement', cause instanceof Error ? cause.message : 'Impossible de télécharger cet épisode.'); }
  };
  const availableLanguages = [...new Set(episodes.map(episodeLanguage).filter(Boolean))];
  const visibleEpisodes = episodes.filter(episode => language === 'all' || episodeLanguage(episode) === language).sort((a, b) => descending ? b.number - a.number : a.number - b.number);
  const selectedSeason = seasons.find(season => season.id === seasonId);
  const primaryEpisode = resumeId || [...episodes].sort((a, b) => a.number - b.number).find(episode => !episode.isWatched)?.id || episodes[0]?.id;
  const batchDownload = () => {
    const candidates = visibleEpisodes.filter(episode => ![DownloadStatus.DOWNLOADED, DownloadStatus.DOWNLOADING, DownloadStatus.QUEUED].includes(episode.downloadStatus) && (episode.streamingUrls.length || episode.streaming_servers?.length));
    if (!candidates.length) { Alert.alert('Téléchargements', 'Aucun nouvel épisode disponible au téléchargement.'); return; }
    Alert.alert('Télécharger la sélection', `Ajouter ${candidates.length} épisodes à la file de téléchargement ?`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Télécharger', onPress: async () => {
      setBatchBusy(true);
      let failures = 0;
      for (const episode of candidates) { try { await enqueueDownload(episode); } catch { failures += 1; } }
      setBatchBusy(false);
      if (failures) Alert.alert('Téléchargements', `${failures} épisode(s) n’ont pas pu être ajoutés.`);
    } }]);
  };

  const episodeSkeleton = <View style={{ gap: 18 }}>{[0, 1, 2].map(key => <View key={key} style={styles.episodeRow}><SkeletonBlock width={138} height={78} /><View style={{ flex: 1, gap: 12 }}><SkeletonBlock width="90%" height={18} /><SkeletonBlock width="65%" height={12} /></View></View>)}</View>;
  const pageSkeleton = <SkeletonGroup><ScrollView contentContainerStyle={{ paddingBottom: 100 }}><SkeletonBlock width="100%" height={heroHeight} /><View style={{ padding: 16, gap: 20 }}><SkeletonBlock width="80%" height={32} /><SkeletonBlock width="50%" height={18} /><SkeletonBlock width="100%" height={72} /><SkeletonBlock width="100%" height={45} />{episodeSkeleton}</View></ScrollView></SkeletonGroup>;
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <LoadingSwap loading={loading} skeleton={pageSkeleton} style={{ flex: 1 }}>
      {anime ? <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: heroHeight, backgroundColor: colors.surface }}>
          {(anime.banner || anime.thumbnail) && <Image source={{ uri: anime.banner || anime.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
          <LinearGradient colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.15)', colors.background]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
          <View style={[styles.heroTitle, { paddingBottom: 16 }]}><Text style={[styles.title, { color: colors.text }]}>{anime.title}</Text>{(anime.genres.length > 0 || anime.year > 1900) && <Text style={{ color: colors.textSecondary, marginTop: 12, lineHeight: 20 }}>{[...anime.genres.slice(0, 3), anime.year > 1900 ? anime.year : ''].filter(Boolean).join(' · ')}</Text>}</View>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {anime.rating > 0 && <View style={styles.rating}><Ionicons name="star" size={17} color={colors.primary} /><Text style={{ color: colors.text, fontWeight: '600' }}>{anime.rating.toFixed(1)} / 10</Text><Text style={{ color: colors.textSecondary }}>Note moyenne</Text></View>}
          <View style={styles.actions}><TouchableOpacity accessibilityLabel={inWatchlist ? 'Retirer de la watchlist' : 'Ajouter à la watchlist'} disabled={watchlistBusy} onPress={toggleWatchlist} style={styles.action}><Ionicons name={inWatchlist ? 'bookmark' : 'bookmark-outline'} size={25} color={inWatchlist ? colors.primary : colors.text} /><Text style={{ color: inWatchlist ? colors.primary : colors.text, fontSize: 12, marginTop: 7 }}>Watchlist</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Partager cet anime" onPress={() => Share.share({ message: `${anime.title}${anime.url_anime_sama ? `\n${anime.url_anime_sama}` : ''}` }).catch(() => Alert.alert('Partage', 'Le partage est indisponible.'))} style={styles.action}><Ionicons name="share-social-outline" size={25} color={colors.text} /><Text style={{ color: colors.text, fontSize: 12, marginTop: 7 }}>Partager</Text></TouchableOpacity></View>
          {anime.synopsis ? <TouchableOpacity accessibilityLabel={expanded ? 'Réduire le synopsis' : 'Afficher le synopsis complet'} onPress={() => setExpanded(value => !value)}><Text style={{ color: colors.text, fontSize: 14, lineHeight: 23 }} numberOfLines={expanded ? undefined : 3}>{anime.synopsis.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').trim()}</Text><View style={styles.synopsisToggle}><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{expanded ? 'Réduire' : 'En savoir plus'}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={colors.textSecondary} size={17} /></View></TouchableOpacity> : <Text style={{ color: colors.textSecondary }}>Synopsis non renseigné.</Text>}
        </View>
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>{([{ key: 'episodes', label: 'Épisodes' }, { key: 'similar', label: 'Similaires' }] as const).map(option => <TouchableOpacity key={option.key} accessibilityRole="tab" accessibilityState={{ selected: tab === option.key }} onPress={() => setTab(option.key)} style={[styles.tab, { borderBottomColor: tab === option.key ? colors.primary : 'transparent' }]}><Text style={{ color: tab === option.key ? colors.text : colors.textSecondary, fontWeight: '700', fontSize: 15 }}>{option.label}</Text></TouchableOpacity>)}</View>
        {tab === 'episodes' ? <View style={{ paddingHorizontal: 16 }}>
          <View style={styles.episodeToolbar}><TouchableOpacity accessibilityLabel="Choisir une saison" disabled={!seasons.length} onPress={() => setShowSeasons(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '600' }}>{selectedSeason ? seasonTitle(selectedSeason) : 'Épisodes'}</Text>{seasons.length > 0 && <Ionicons name="chevron-down" color={colors.text} size={20} />}</TouchableOpacity><TouchableOpacity accessibilityLabel={descending ? 'Trier les épisodes du premier au dernier' : 'Trier les épisodes du dernier au premier'} onPress={() => setDescending(value => !value)} style={styles.iconButton}><Ionicons name={descending ? 'arrow-up' : 'arrow-down'} size={22} color={colors.text} /></TouchableOpacity>{Platform.OS !== 'web' && <TouchableOpacity accessibilityLabel="Télécharger les épisodes affichés" disabled={batchBusy || episodesLoading} onPress={batchDownload} style={styles.iconButton}><Ionicons name="download-outline" size={23} color={batchBusy ? colors.textSecondary : colors.text} /></TouchableOpacity>}</View>
          {availableLanguages.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>{['all', ...availableLanguages].map(value => <TouchableOpacity key={value} onPress={() => setLanguage(value)} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: language === value ? colors.buttonBg : colors.surface }}><Text style={{ color: language === value ? colors.buttonText : colors.text }}>{value === 'all' ? 'Toutes les langues' : value}</Text></TouchableOpacity>)}</ScrollView>}
          {episodeError && visibleEpisodes.length > 0 && <Text style={{ color: colors.warning, marginBottom: 16 }}>{episodeError}</Text>}<LoadingSwap loading={episodesLoading} skeleton={<SkeletonGroup>{episodeSkeleton}</SkeletonGroup>}>
            {episodeError && !visibleEpisodes.length ? <TouchableOpacity onPress={() => seasonId ? loadSeason(seasonId) : loadDetails()}><Text style={{ color: colors.error, paddingVertical: 24 }}>{episodeError}</Text></TouchableOpacity> : visibleEpisodes.length ? visibleEpisodes.slice(0, episodeLimit).map(episode => {
              const image = episode.thumbnail && !episode.thumbnail.includes('placeholder') ? episode.thumbnail : anime.banner || anime.thumbnail;
              const downloading = [DownloadStatus.DOWNLOADING, DownloadStatus.QUEUED].includes(episode.downloadStatus);
              return <View key={episode.id} style={styles.episodeRow}><TouchableOpacity onPress={() => play(episode.id)} accessibilityLabel={`Lire l’épisode ${episode.number} : ${episode.title}`} style={{ width: 138, height: 78, backgroundColor: colors.surface }}>{image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}<View style={styles.playOverlay}><Ionicons name={episode.isWatched ? 'refresh' : 'play'} size={26} color="#fff" /></View>{episode.watchProgress > 0 && <View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={{ height: 3, width: `${Math.min(100, episode.watchProgress)}%`, backgroundColor: colors.primary }} /></View>}</TouchableOpacity><TouchableOpacity onPress={() => play(episode.id)} style={{ flex: 1 }}><Text numberOfLines={2} style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{`E${episode.number} · ${episode.title}`}</Text><Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>{[episodeLanguage(episode), episode.duration > 0 ? `${Math.round(episode.duration / 60)} min` : '', episode.isWatched ? 'Regardé' : ''].filter(Boolean).join(' · ')}</Text></TouchableOpacity>{Platform.OS !== 'web' && <TouchableOpacity disabled={episode.downloadStatus === DownloadStatus.DOWNLOADING} accessibilityLabel={episode.downloadStatus === DownloadStatus.DOWNLOADING ? 'Téléchargement en cours' : downloading ? 'Annuler le téléchargement' : episode.downloadStatus === DownloadStatus.DOWNLOADED ? 'Lire l’épisode téléchargé' : 'Télécharger cet épisode'} onPress={() => download(episode)} style={styles.downloadButton}><Ionicons name={episode.downloadStatus === DownloadStatus.DOWNLOADED ? 'checkmark-circle' : downloading ? 'close-circle-outline' : 'download-outline'} size={23} color={downloading || episode.downloadStatus === DownloadStatus.DOWNLOADED ? colors.primary : colors.textSecondary} /></TouchableOpacity>}</View>;
            }) : <Text style={{ color: colors.textSecondary, paddingVertical: 32 }}>Aucun épisode disponible pour cette sélection.</Text>}
            {!episodesLoading && visibleEpisodes.length > episodeLimit && <TouchableOpacity accessibilityLabel="Afficher 24 épisodes supplémentaires" onPress={() => setEpisodeLimit(limit => limit + 24)} style={{ paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }}><Text style={{ color: colors.primary, fontWeight: '600' }}>Afficher plus d’épisodes</Text><Text style={{ color: colors.textSecondary, marginTop: 6, fontSize: 12 }}>{Math.min(episodeLimit, visibleEpisodes.length)} / {visibleEpisodes.length} épisodes</Text></TouchableOpacity>}
          </LoadingSwap>
        </View> : <View style={styles.similarGrid}>{similar.length ? similar.map(item => <TouchableOpacity key={item.id} onPress={() => navigation.push('AnimeDetail', { animeId: item.id })} style={{ width: Math.min(200, (width - 40) / 2), marginBottom: 16 }}><Image source={{ uri: item.thumbnail }} style={{ width: '100%', aspectRatio: 2 / 3, backgroundColor: colors.surface }} /><Text numberOfLines={2} style={{ color: colors.text, marginTop: 10, lineHeight: 21 }}>{item.title}</Text></TouchableOpacity>) : <Text style={{ color: colors.textSecondary, paddingVertical: 24 }}>Aucun titre similaire renseigné.</Text>}</View>}
      </ScrollView> : <View style={styles.error}><Text style={{ color: colors.text, fontSize: 20 }}>Fiche indisponible</Text><Text style={{ color: colors.textSecondary, lineHeight: 23, marginTop: 12 }}>{error}</Text><TouchableOpacity onPress={loadDetails} style={[styles.retry, { backgroundColor: colors.buttonBg }]}><Text style={{ color: colors.buttonText }}>Réessayer</Text></TouchableOpacity></View>}
    </LoadingSwap>
    <TouchableOpacity accessibilityLabel="Retour" onPress={() => navigation.goBack()} style={[styles.back, { top: insets.top + 12 }]}><Ionicons name="chevron-back" color="#fff" size={29} /></TouchableOpacity>
    {!loading && anime && <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom), backgroundColor: colors.background, borderTopColor: colors.border }]}><TouchableOpacity disabled={!primaryEpisode} accessibilityLabel={resumeId ? 'Reprendre la lecture' : 'Commencer la lecture'} onPress={() => primaryEpisode && play(primaryEpisode)} style={[styles.primaryButton, { backgroundColor: colors.buttonBg, opacity: primaryEpisode ? 1 : 0.45 }]}><Ionicons name="play" size={20} color={colors.buttonText} /><Text style={{ color: colors.buttonText, fontWeight: '700', fontSize: 15 }}>{resumeId ? 'REPRENDRE LA LECTURE' : primaryEpisode ? 'COMMENCER À REGARDER' : 'AUCUN ÉPISODE DISPONIBLE'}</Text></TouchableOpacity></View>}
    <CustomModal visible={showSeasons} onRequestClose={() => setShowSeasons(false)} alignment="bottom"><View style={{ paddingBottom: Math.max(insets.bottom, 16) }}><View style={styles.seasonsHeader}><Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Saisons</Text><TouchableOpacity accessibilityLabel="Fermer les saisons" onPress={() => setShowSeasons(false)} style={styles.iconButton}><Ionicons name="close" color={colors.text} size={25} /></TouchableOpacity></View><ScrollView style={{ maxHeight: 420 }}>{seasons.map(season => <TouchableOpacity key={season.id} accessibilityState={{ selected: season.id === seasonId }} onPress={() => { setSeasonId(season.id); setLanguage('all'); setShowSeasons(false); }} style={[styles.seasonOption, { borderBottomColor: colors.border }]}><View style={{ flex: 1 }}><Text style={{ color: season.id === seasonId ? colors.primary : colors.text, fontSize: 16 }}>{seasonTitle(season)}</Text><Text style={{ color: colors.textSecondary, marginTop: 6, fontSize: 12 }}>{[season.annee_sortie || '', `${season.nb_episodes} épisodes`, season.type || ''].filter(Boolean).join(' · ')}</Text></View>{season.id === seasonId && <Ionicons name="checkmark" color={colors.primary} size={22} />}</TouchableOpacity>)}</ScrollView></View></CustomModal>
  </View>;
}

const styles = StyleSheet.create({
  heroTitle: { position: 'absolute', bottom: 0, left: 16, right: 16 }, title: { fontSize: 30, lineHeight: 37, fontWeight: '800' }, back: { position: 'absolute', left: 12, backgroundColor: 'rgba(0,0,0,0.5)', width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, actions: { flexDirection: 'row', gap: 30, paddingVertical: 22 }, action: { alignItems: 'center', minWidth: 54 }, synopsisToggle: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12, marginBottom: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 }, tab: { flex: 1, alignItems: 'center', paddingVertical: 16, borderBottomWidth: 3 }, episodeToolbar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 17 }, iconButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  episodeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }, playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }, progressTrack: { height: 3, position: 'absolute', bottom: 0, left: 0, right: 0 }, downloadButton: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' }, similarGrid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bottomBar: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12 }, primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12 }, seasonsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16 }, seasonOption: { padding: 18, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' }, error: { flex: 1, justifyContent: 'center', padding: 24 }, retry: { padding: 14, alignSelf: 'flex-start', marginTop: 20 },
});
