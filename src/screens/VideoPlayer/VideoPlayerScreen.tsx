import { radii } from '../../theme/shape';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, ActivityIndicator, useWindowDimensions, Modal, Switch, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView, VideoSource } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { RootStackScreenProps } from '../../types/navigation';
import { Anime, Episode } from '../../types/anime';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import videoUrlExtractor from '../../services/VideoUrlExtractor';
import useReducedMotion from '../../hooks/useReducedMotion';
import { palette } from '../../theme/palette';
import PlayerDetails from './PlayerDetails';

const colors = palette.dark;
const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const directUrl = (url: string) => /^https?:\/\//i.test(url) && /\.(m3u8|mp4|webm|mov)(?:[?#]|$)/i.test(url);
type SourceOption = { label: string; url: string };
export default function VideoPlayerScreen({ route, navigation }: RootStackScreenProps<'VideoPlayer'>) {
  const { episodeId, animeId, autoPlay = false, localFilePath, isOfflineMode = false } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [anime, setAnime] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [source, setSource] = useState<VideoSource | null>(null);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [embed, setEmbed] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [controls, setControls] = useState(true);
  const [controlsActivity, setControlsActivity] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('idle');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [autoNext, setAutoNext] = useState(autoPlay);
  const [drag, setDrag] = useState<number | null>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackWidth = useRef(1);
  const progressRef = useRef({ time: 0, duration: 0 });
  const lastSave = useRef(0);
  const resumePercent = useRef(0);
  const player = useVideoPlayer(null, video => { video.timeUpdateEventInterval = 0.25; });
  const current = episodes.findIndex(item => item.id === episodeId);
  const next = current >= 0 ? episodes[current + 1] : undefined;
  const servers = episode?.streaming_servers?.filter(server => /^https?:\/\//i.test(server.url)) ?? [];
  const navigateEpisode = useCallback((item: Episode) => { player.pause(); navigation.replace('VideoPlayer', { animeId, episodeId: item.id, autoPlay: true }); }, [animeId, navigation, player]);
  const show = useCallback(() => { opacity.stopAnimation(); setControls(true); setControlsActivity(value => value + 1); Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 160, useNativeDriver: true }).start(); }, [opacity, reduced]);
  const saveProgress = useCallback(() => {
    const value = progressRef.current;
    if (value.duration <= 0 || !episode) return;
    const progress = Math.max(0, Math.min(100, value.time / value.duration * 100));
    void databaseService.updateWatchHistory(animeId, episodeId, progress).catch(() => {});
    void databaseService.updateEpisodeProgress(episodeId, progress, progress >= 95).catch(() => {});
  }, [animeId, episodeId, episode]);
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return () => { void ScreenOrientation.unlockAsync().catch(() => {}); opacity.stopAnimation(); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [opacity]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSource(null); setEmbed(''); setSources([]); setEpisode(null); setEpisodes([]); setAnime(null); setTime(0); setDuration(0); player.pause();
    progressRef.current = { time: 0, duration: 0 }; lastSave.current = 0; resumePercent.current = 0;
    const load = async () => {
      try {
        let item: Episode;
        let list: Episode[];
        let animeData: Anime | null;
        if (isOfflineMode) {
          list = await databaseService.getAnimeEpisodes(animeId);
          const local = list.find(candidate => candidate.id === episodeId);
          if (!local) throw new Error('Les informations de cet épisode ne sont pas disponibles hors ligne.');
          item = local; resumePercent.current = local.watchProgress < 95 ? local.watchProgress : 0; animeData = await databaseService.getAnime(animeId);
        } else {
          list = []; animeData = null;
          const metadata = apiService.getAnimeById(animeId).then(data => { if (active) setAnime(data); return data; }).catch(() => null);
          item = await apiService.getEpisodeById(episodeId);
          const history = await databaseService.getWatchHistory(100).catch(() => []);
          const saved = history.find(entry => entry.episodeId === episodeId);
          resumePercent.current = saved && saved.progress < 95 ? saved.progress : 0;
          item = { ...item, watchProgress: resumePercent.current };
          const onlineEpisode = item;
          void (async () => {
            const data = await metadata;
            if (data) await databaseService.saveAnime(data);
            else if (!(await databaseService.getAnime(animeId))) return;
            const cachedEpisodes = await databaseService.getAnimeEpisodes(animeId);
            const cached = cachedEpisodes.find(candidate => candidate.id === episodeId);
            await databaseService.saveEpisode({ ...onlineEpisode,
              watchProgress: cached?.watchProgress ?? onlineEpisode.watchProgress,
              isWatched: cached?.isWatched ?? onlineEpisode.isWatched,
              downloadStatus: cached?.downloadStatus ?? onlineEpisode.downloadStatus,
            });
          })().catch(() => {});
          if (item.saison_id) void apiService.getSeasonEpisodes(item.saison_id, animeId).then(values => {
            if (active) setEpisodes(values.filter(candidate => !item.langue || !candidate.langue || candidate.langue === item.langue));
          }).catch(() => { if (active) setEpisodes([item]); });
          else list = [item];
        }
        if (!active) return;
        setEpisode(item); if (list.length) setEpisodes(list); if (animeData) setAnime(animeData);
        if (isOfflineMode && localFilePath) {
          const playlist = localFilePath.endsWith('.ts') ? localFilePath.replace(/\.ts$/, '.m3u8') : localFilePath;
          const playlistInfo = await FileSystem.getInfoAsync(playlist);
          const uri = playlistInfo.exists ? playlist : localFilePath;
          if (!(await FileSystem.getInfoAsync(uri)).exists) throw new Error('Le fichier téléchargé est introuvable.');
          if (active) setSource({ uri: uri.startsWith('file://') ? uri : `file://${uri}` });
          return;
        }
        let options: SourceOption[] = (item.streamingUrls ?? []).filter(value => directUrl(value.url)).map(value => ({ label: value.quality || 'Auto', url: value.url }));
        if (!options.length) {
          const result = await videoUrlExtractor.extractHLSForEpisode(episodeId).catch(() => ({ urls: [] }));
          options = result.urls.filter(value => value.type === 'hls' || value.type === 'mp4').map(value => ({ label: value.quality || 'Auto', url: value.url }));
        }
        if (!active) return;
        if (options.length) { setSources(options); setSource({ uri: options[0].url }); }
        else {
          const provider = item.streaming_servers?.find(server => /^https?:\/\//i.test(server.url));
          if (provider) setEmbed(provider.url);
          else setError('Aucun lecteur disponible pour cet épisode.');
        }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : 'Impossible de charger cet épisode.'); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [episodeId, animeId, attempt, isOfflineMode, localFilePath, player]);
  useEffect(() => {
    let active = true;
    void player.replaceAsync(source).then(() => { if (active && source) { player.playbackRate = speed; if (autoPlay) player.play(); } }).catch(() => { if (active && source) setError('Le lecteur n’a pas pu ouvrir cette source. Essayez un autre serveur.'); });
    return () => { active = false; };
  }, [source, player]);
  useEffect(() => { player.playbackRate = speed; }, [player, speed]);
  useEffect(() => {
    const listeners = [
      player.addListener('timeUpdate', event => { setTime(event.currentTime); setDuration(player.duration); progressRef.current = { time: event.currentTime, duration: player.duration }; if (Date.now() - lastSave.current > 10000) { lastSave.current = Date.now(); saveProgress(); } }),
      player.addListener('playingChange', event => setPlaying(event.isPlaying)),
      player.addListener('statusChange', event => { setStatus(event.status); if (event.status === 'readyToPlay') setDuration(player.duration); if (event.status === 'readyToPlay' && resumePercent.current > 0 && player.duration > 0) { player.currentTime = player.duration * Math.min(100, resumePercent.current) / 100; resumePercent.current = 0; } if (event.status === 'error') { setError('Impossible de lire cette source. Sélectionnez un autre lecteur.'); show(); } }),
      player.addListener('playToEnd', () => { saveProgress(); show(); if (autoNext && next) navigateEpisode(next); }),
    ];
    return () => { listeners.forEach(listener => listener.remove()); saveProgress(); };
  }, [player, saveProgress, show, autoNext, next, navigateEpisode]);
  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing && controls && !settings && drag === null) hideTimer.current = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: reduced ? 0 : 220, useNativeDriver: true }).start(({ finished }) => { if (finished) setControls(false); }), 3500);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [playing, controls, settings, drag, opacity, reduced, controlsActivity]);
  const toggleFullscreen = async () => { const target = !fullscreen; setFullscreen(target); show(); try { await ScreenOrientation.lockAsync(target ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch { setError('La rotation automatique n’est pas disponible sur cet appareil.'); } };
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => { if (!fullscreen) return false; void toggleFullscreen(); return true; }); return () => listener.remove(); }, [fullscreen]);
  const seek = (position: number) => { if (!duration) return; const target = Math.max(0, Math.min(duration, position)); player.currentTime = target; setTime(target); show(); };
  const seekPosition = (x: number) => Math.max(0, Math.min(1, x / trackWidth.current)) * duration;
  const fraction = duration > 0 ? Math.max(0, Math.min(1, (drag ?? time) / duration)) : 0;
  const icon = (name: React.ComponentProps<typeof Ionicons>['name'], label: string, action: () => void, disabled = false) => <TouchableOpacity accessibilityLabel={label} onPress={action} disabled={disabled} style={[styles.icon, disabled && { opacity: 0.3 }]}><Ionicons name={name} color="white" size={24} /></TouchableOpacity>;
  return <View style={[styles.root, { paddingTop: fullscreen ? 0 : insets.top }]}><StatusBar style="light" hidden={fullscreen} />
    <View style={[styles.video, { height: fullscreen ? height : width * 9 / 16 }]}>
      {loading ? <ActivityIndicator size="large" color={colors.primary} /> : embed ? <WebView key={embed} source={{ uri: embed }} style={StyleSheet.absoluteFill} allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} onError={() => setError('Ce serveur ne répond pas. Essayez un autre lecteur.')} /> : source ? <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} fullscreenOptions={{ enable: false }} contentFit="contain" /> : <View style={styles.empty}><Ionicons name="videocam-off-outline" color={colors.textSecondary} size={36} /><Text style={styles.error}>{error || 'Aucun lecteur disponible.'}</Text><TouchableOpacity onPress={() => setAttempt(value => value + 1)} style={styles.retry}><Text style={{ color: 'white', fontWeight: '600' }}>Réessayer</Text></TouchableOpacity></View>}
      {!embed && source && !loading && <TouchableOpacity accessibilityLabel="Afficher les commandes" activeOpacity={1} onPress={show} style={StyleSheet.absoluteFill} />}
      {(embed || loading || !source) ? <View style={styles.embedToolbar}>{icon('chevron-back', 'Retour', () => navigation.goBack())}<View style={{ flex: 1 }} />{icon('settings-outline', 'Choisir un lecteur', () => setSettings(true))}{icon(fullscreen ? 'contract-outline' : 'expand-outline', 'Plein écran', () => void toggleFullscreen())}</View> : <Animated.View pointerEvents={controls ? 'box-none' : 'none'} style={[styles.overlay, { opacity }]}>
        <View style={[styles.top, fullscreen && { paddingLeft: insets.left + 6, paddingRight: insets.right + 6 }]}>{icon('chevron-back', 'Retour', () => fullscreen ? void toggleFullscreen() : navigation.goBack())}<Text numberOfLines={1} style={styles.overlayTitle}>{fullscreen ? anime?.title || episode?.animeTitle : ''}</Text>{icon('play-skip-forward-outline', 'Épisode suivant', () => next && navigateEpisode(next), !next)}{icon('settings-outline', 'Options de lecture', () => setSettings(true))}</View>
        <View style={styles.center}>{icon('play-back-outline', 'Reculer de 10 secondes', () => seek(time - 10))}<Text style={styles.skipLabel}>10</Text><TouchableOpacity accessibilityLabel={playing ? 'Pause' : 'Lire'} onPress={() => { playing ? player.pause() : player.play(); show(); }} style={styles.playButton}>{status === 'loading' ? <ActivityIndicator color="white" size="large" /> : <Ionicons name={playing ? 'pause' : 'play'} color="white" size={42} />}</TouchableOpacity><Text style={styles.skipLabel}>10</Text>{icon('play-forward-outline', 'Avancer de 10 secondes', () => seek(time + 10))}</View>
        <View style={styles.bottom}><View style={styles.seek} accessibilityRole="adjustable" accessibilityLabel="Progression de lecture" accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(time), text: clock(time) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={event => seek(time + (event.nativeEvent.actionName === 'increment' ? 10 : -10))} onLayout={event => { trackWidth.current = event.nativeEvent.layout.width; }} onStartShouldSetResponder={() => duration > 0} onMoveShouldSetResponder={() => duration > 0} onResponderGrant={event => { setDrag(seekPosition(event.nativeEvent.locationX)); show(); }} onResponderMove={event => setDrag(seekPosition(event.nativeEvent.locationX))} onResponderRelease={event => { seek(seekPosition(event.nativeEvent.locationX)); setDrag(null); }} onResponderTerminate={() => setDrag(null)}><View style={styles.track}><View style={[styles.fill, { width: `${fraction * 100}%` }]} /><View style={[styles.thumb, { left: `${fraction * 100}%` }]} /></View></View><View style={styles.timeRow}><Text style={styles.time}>{clock(drag ?? time)} / {clock(duration)}</Text>{isOfflineMode && <Text style={styles.offline}>Hors ligne</Text>}{icon(fullscreen ? 'contract-outline' : 'expand-outline', fullscreen ? 'Quitter le plein écran' : 'Plein écran', () => void toggleFullscreen())}</View></View>
      </Animated.View>}
    </View>
    {!fullscreen && <ScrollView style={{ flex: 1 }}>{!!error && (source || embed) && <Text style={[styles.error, { padding: 20 }]}>{error}</Text>}{episode && <PlayerDetails anime={anime} episode={episode} episodes={episodes} onEpisode={navigateEpisode} onAnime={() => navigation.navigate('AnimeDetail', { animeId })} />}</ScrollView>}
    <Modal visible={settings} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={() => setSettings(false)} supportedOrientations={['portrait', 'landscape']}><View style={styles.backdrop}><TouchableOpacity style={{ flex: 1 }} accessibilityLabel="Fermer les options" onPress={() => setSettings(false)} /><View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom) }]}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Options de lecture</Text>{icon('close', 'Fermer', () => setSettings(false))}</View><ScrollView style={{ maxHeight: height * 0.6 }}>
      {source && <><Text style={styles.optionLabel}>Vitesse de lecture</Text><View style={styles.speeds}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => <TouchableOpacity key={rate} accessibilityState={{ selected: speed === rate }} onPress={() => setSpeed(rate)} style={[styles.speed, speed === rate && { backgroundColor: colors.buttonBg }]}><Text style={{ color: 'white' }}>{rate}×</Text></TouchableOpacity>)}</View><View style={styles.optionRow}><Text style={styles.optionLabel}>Enchaîner les épisodes</Text><Switch value={autoNext} onValueChange={setAutoNext} trackColor={{ true: colors.buttonBg }} /></View></>}
      {!!sources.length && <><Text style={styles.optionLabel}>Sources vidéo</Text>{sources.map((option, index) => <TouchableOpacity key={`${option.url}-${index}`} style={styles.optionRow} onPress={() => { player.pause(); setEmbed(''); setSource({ uri: option.url }); setError(''); setSettings(false); show(); }}><Text style={styles.optionText}>{option.label}</Text></TouchableOpacity>)}</>}
      {!isOfflineMode && <><Text style={styles.optionLabel}>Serveurs</Text>{servers.map((server, index) => <TouchableOpacity key={`${server.url}-${index}`} style={styles.optionRow} onPress={() => { player.pause(); setSource(null); setEmbed(server.url); setError(''); setSettings(false); }}><Text style={[styles.optionText, embed === server.url && { color: colors.primary }]}>{server.name || `Lecteur ${index + 1}`}{server.langue ? ` • ${server.langue}` : ''}</Text>{embed === server.url && <Ionicons name="checkmark" size={22} color={colors.primary} />}</TouchableOpacity>)}{!servers.length && <Text style={styles.error}>Aucun serveur supplémentaire.</Text>}</>}
    </ScrollView></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000' }, video: { width: '100%', backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, icon: { padding: 10 }, overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'space-between' }, top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }, overlayTitle: { color: 'white', flex: 1, fontSize: 14, marginHorizontal: 4 }, center: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, playButton: { paddingHorizontal: 24, paddingVertical: 5 }, skipLabel: { color: 'white', fontSize: 11 }, bottom: { paddingHorizontal: 18 }, seek: { height: 26, justifyContent: 'center' }, track: { height: 3, backgroundColor: 'rgba(255,255,255,0.4)' }, fill: { height: 3, backgroundColor: colors.primary }, thumb: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, position: 'absolute', marginLeft: -5, top: -3.5 }, timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, time: { color: 'white', fontSize: 11 }, offline: { color: colors.primary, fontSize: 11 }, embedToolbar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center' }, empty: { alignItems: 'center', gap: 14, padding: 20 }, error: { color: colors.textSecondary, fontSize: 13, lineHeight: 21 }, retry: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: colors.buttonBg, borderRadius: radii.pill }, backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }, sheet: { backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: 'white', fontSize: 20, fontWeight: '700' }, optionLabel: { color: colors.textSecondary, fontSize: 14, marginVertical: 12 }, optionText: { color: 'white', fontSize: 15 }, optionRow: { paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, speeds: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }, speed: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colors.card } });
