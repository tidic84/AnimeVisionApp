import { radii } from '../../theme/shape';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, ActivityIndicator, useWindowDimensions, Modal, Switch, BackHandler } from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView, VideoSource } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { RootStackScreenProps } from '../../types/navigation';
import { Anime, Episode } from '../../types/anime';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import * as malSync from '../../services/mal/malSync';
import videoUrlExtractor from '../../services/VideoUrlExtractor';
import useReducedMotion from '../../hooks/useReducedMotion';
import { MotionPressable } from '../../components/Motion';
import { motion } from '../../theme/tokens';
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
  const focused = useIsFocused();
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
  const [seekHint, setSeekHint] = useState<{ side: 'left' | 'right'; amount: number } | null>(null);
  const [touchLock, setTouchLock] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef({ at: 0, side: '' });
  const opacity = useRef(new Animated.Value(1)).current;
  const dragProgress = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackWidth = useRef(1);
  const seekBar = useRef<React.ComponentRef<typeof View>>(null);
  const seekBarX = useRef(0);
  const dragValue = useRef<number | null>(null);
  // Après un seek, le lecteur renvoie encore quelques timeUpdate avec l'ancienne position : on les ignore pour que le curseur ne saute pas en arrière.
  const pendingSeek = useRef<{ target: number; until: number } | null>(null);
  const trackArea = useRef(1);
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
    // MAL dès 90 % : quitter pendant le générique de fin doit compter l'épisode comme vu.
    if (progress >= 90) void malSync.episodeWatched(animeId, episode);
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
  // Changer de page laisse cet écran monté dans la pile : sans pause, le son continue en arrière-plan.
  useEffect(() => { if (!focused) { player.pause(); saveProgress(); } }, [focused, player, saveProgress]);
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
  useEffect(() => {
    const listeners = [
      player.addListener('timeUpdate', event => { const pending = pendingSeek.current; if (pending) { if (Date.now() < pending.until && Math.abs(event.currentTime - pending.target) > 1.5) return; pendingSeek.current = null; } setTime(event.currentTime); setDuration(player.duration); progressRef.current = { time: event.currentTime, duration: player.duration }; if (Date.now() - lastSave.current > 10000) { lastSave.current = Date.now(); saveProgress(); } }),
      player.addListener('playingChange', event => setPlaying(event.isPlaying)),
      player.addListener('statusChange', event => { setStatus(event.status); if (event.status === 'readyToPlay') setDuration(player.duration); if (event.status === 'readyToPlay' && resumePercent.current > 0 && player.duration > 0) { player.currentTime = player.duration * Math.min(100, resumePercent.current) / 100; resumePercent.current = 0; } if (event.status === 'error') { setError('Impossible de lire cette source. Sélectionnez un autre lecteur.'); show(); } }),
      // Changer de lecteur remplace la source et peut émettre playToEnd : on n'enchaîne que si la lecture était vraiment à la fin.
      player.addListener('playToEnd', () => { const value = progressRef.current; if (value.duration <= 0 || value.time < value.duration - 3) return; saveProgress(); show(); if (autoNext && next) navigateEpisode(next); }),
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
  const seek = (position: number) => { if (!duration) return; const target = Math.max(0, Math.min(duration, position)); pendingSeek.current = { target, until: Date.now() + 2000 }; progressRef.current = { time: target, duration }; player.currentTime = target; setTime(target); show(); };
  // pageX (coordonnées écran) plutôt que locationX, qui est relatif à la vue touchée et donnait des positions fausses.
  const seekPosition = (pageX: number) => Math.max(0, Math.min(1, (pageX - seekBarX.current) / trackWidth.current)) * duration;
  const measureSeekBar = () => seekBar.current?.measure((_x, _y, barWidth, _height, pageX) => { if (barWidth > 0) { trackWidth.current = barWidth; seekBarX.current = pageX; } });
  const updateDrag = (pageX: number) => { const value = seekPosition(pageX); dragValue.current = value; setDrag(value); };
  const endDrag = (commit: boolean) => { if (commit && dragValue.current !== null) seek(dragValue.current); dragValue.current = null; setDrag(null); };
  const dragging = drag !== null;
  useEffect(() => {
    Animated.timing(dragProgress, { toValue: dragging ? 1 : 0, duration: reduced ? 0 : motion.duration.micro, easing: motion.easing.standard, useNativeDriver: true }).start();
  }, [dragging, reduced, dragProgress]);
  const fraction = duration > 0 ? Math.max(0, Math.min(1, (drag ?? time) / duration)) : 0;
  const icon = (name: React.ComponentProps<typeof Ionicons>['name'], label: string, action: () => void, disabled = false) => <TouchableOpacity accessibilityLabel={label} onPress={action} disabled={disabled} style={[styles.icon, disabled && { opacity: 0.3 }]}><Ionicons name={name} color="white" size={24} /></TouchableOpacity>;
  const hide = () => { opacity.stopAnimation(); Animated.timing(opacity, { toValue: 0, duration: reduced ? 0 : 160, useNativeDriver: true }).start(({ finished }) => { if (finished) setControls(false); }); };
  // Tap simple : affiche/masque l'interface. Double tap : ±10 s selon le côté touché (chaque tap rapide suivant ajoute 10 s).
  const handleTap = (x: number, areaWidth: number) => {
    const side = x < areaWidth / 2 ? 'left' : 'right';
    const now = Date.now();
    const chained = now - lastTap.current.at < 300 && lastTap.current.side === side;
    lastTap.current = { at: now, side };
    if (!chained) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => { tapTimer.current = null; if (controls) hide(); else show(); }, 300);
      return;
    }
    if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
    const delta = side === 'left' ? -10 : 10;
    const target = Math.max(0, Math.min(duration, player.currentTime + delta));
    player.currentTime = target; setTime(target);
    setSeekHint(hint => ({ side, amount: (hint?.side === side ? hint.amount : 0) + 10 }));
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setSeekHint(null), 700);
  };
  const closeSettings = () => { setSettings(false); setTouchLock(true); setTimeout(() => setTouchLock(false), 500); };
  const ui = fullscreen ? { side: 48, title: 20, subtitle: 15, icon: 30, skip: 44, play: 72, gap: 120 } : { side: 12, title: 15, subtitle: 12, icon: 24, skip: 34, play: 52, gap: 44 };
  const control = (name: React.ComponentProps<typeof MaterialIcons>['name'], label: string, action: () => void, size = ui.icon) => <MotionPressable pressedScale={0.88} accessibilityLabel={label} onPress={() => { action(); show(); }} hitSlop={8} style={styles.control}><MaterialIcons name={name} color="white" size={size} /></MotionPressable>;
  const seriesTitle = anime?.title || episode?.animeTitle || '';
  const episodeTitle = episode ? `E${episode.number} - ${episode.title || episode.titre_episode || `Épisode ${episode.number}`}` : '';
  return <View style={[styles.root, { paddingTop: fullscreen ? 0 : insets.top }]}><StatusBar style="light" hidden={fullscreen} />
    {/* Plein écran : flex 1 plutôt qu'une hauteur calculée depuis les dimensions, qui restent celles du portrait le temps de la rotation et poussaient la vidéo en bas de l'écran. */}
    <View style={[styles.video, fullscreen ? { flex: 1 } : { aspectRatio: 16 / 9 }]}>
      {loading ? <ActivityIndicator size="large" color={colors.primary} /> : embed ? (focused ? <WebView key={embed} source={{ uri: embed }} style={StyleSheet.absoluteFill} allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} onError={() => setError('Ce serveur ne répond pas. Essayez un autre lecteur.')} /> : null) : source ? <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} fullscreenOptions={{ enable: false }} contentFit="contain" /> : <View style={styles.empty}><Ionicons name="videocam-off-outline" color={colors.textSecondary} size={36} /><Text style={styles.error}>{error || 'Aucun lecteur disponible.'}</Text><TouchableOpacity onPress={() => setAttempt(value => value + 1)} style={styles.retry}><Text style={{ color: 'white', fontWeight: '600' }}>Réessayer</Text></TouchableOpacity></View>}
      {!embed && source && !loading && <View accessible accessibilityLabel={controls ? 'Masquer les commandes' : 'Afficher les commandes'} accessibilityRole="button" onAccessibilityTap={() => controls ? hide() : show()} style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={event => handleTap(event.nativeEvent.locationX, trackArea.current)} onLayout={event => { trackArea.current = event.nativeEvent.layout.width; }} />}
      {seekHint && <View pointerEvents="none" style={[styles.seekHint, seekHint.side === 'left' ? { left: 0 } : { right: 0 }]}><MaterialIcons name={seekHint.side === 'left' ? 'fast-rewind' : 'fast-forward'} color="white" size={32} /><Text style={styles.seekHintText}>{seekHint.side === 'left' ? '-' : '+'}{seekHint.amount} s</Text></View>}
      {(embed || loading || !source) ? <View style={[styles.embedToolbar, fullscreen && { paddingLeft: insets.left, paddingRight: insets.right }]}>{icon('chevron-back', 'Retour', () => fullscreen ? void toggleFullscreen() : navigation.goBack())}<View style={{ flex: 1 }} />{icon('settings-outline', 'Choisir un lecteur', () => setSettings(true))}{icon(fullscreen ? 'contract-outline' : 'expand-outline', 'Plein écran', () => void toggleFullscreen())}</View> : <Animated.View pointerEvents={controls ? 'box-none' : 'none'} style={[styles.overlay, { opacity, paddingLeft: ui.side + (fullscreen ? insets.left : 0), paddingRight: ui.side + (fullscreen ? insets.right : 0), paddingTop: fullscreen ? 20 : 6, paddingBottom: fullscreen ? Math.max(8, insets.bottom) : 0 }]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} /><LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)']} style={styles.scrimTop} /><LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']} style={styles.scrimBottom} />
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.center, { gap: ui.gap }]}>
          {control('replay-10', 'Reculer de 10 secondes', () => seek(time - 10), ui.skip)}
          <MotionPressable pressedScale={0.88} accessibilityLabel={playing ? 'Pause' : 'Lire'} onPress={() => { playing ? player.pause() : player.play(); show(); }} style={[styles.playButton, { width: ui.play + 16, height: ui.play + 16 }]}>{status === 'loading' ? <ActivityIndicator color="white" size="large" /> : <MaterialIcons name={playing ? 'pause' : 'play-arrow'} color="white" size={ui.play} />}</MotionPressable>
          {control('forward-10', 'Avancer de 10 secondes', () => seek(time + 10), ui.skip)}
        </View>
        <View pointerEvents="box-none" style={styles.top}>
          {!fullscreen && <TouchableOpacity accessibilityLabel="Retour" onPress={() => navigation.goBack()} hitSlop={8} style={[styles.control, { marginLeft: -8 }]}><Ionicons name="chevron-down" color="white" size={ui.icon} /></TouchableOpacity>}
          <View pointerEvents="none" style={styles.titles}><Text numberOfLines={1} style={[styles.overlayTitle, { fontSize: ui.title }]}>{seriesTitle}</Text>{!!episodeTitle && <Text numberOfLines={1} style={[styles.overlaySubtitle, { fontSize: ui.subtitle }]}>{episodeTitle}</Text>}</View>
          <View style={[styles.actions, { gap: fullscreen ? 28 : 6 }]}>
            {next && control('skip-next', 'Épisode suivant', () => navigateEpisode(next))}
            {control('settings', 'Options de lecture', () => setSettings(true))}
            <TouchableOpacity accessibilityLabel={fullscreen ? 'Quitter le plein écran' : 'Plein écran'} onPress={() => void toggleFullscreen()} hitSlop={8} style={styles.control}><MaterialCommunityIcons name={fullscreen ? 'arrow-collapse' : 'arrow-expand'} color="white" size={ui.icon} /></TouchableOpacity>
          </View>
        </View>
        <View pointerEvents="box-none">
          <View pointerEvents="none" style={styles.timeRow}><Text style={[styles.time, fullscreen && { fontSize: 14 }]}>{clock(drag ?? time)}</Text>{isOfflineMode && <Text style={styles.offline}>Hors ligne</Text>}<Text style={[styles.time, fullscreen && { fontSize: 14 }]}>{clock(duration)}</Text></View>
          <View style={styles.seek} accessibilityRole="adjustable" accessibilityLabel="Progression de lecture" accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(time), text: clock(time) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={event => seek(time + (event.nativeEvent.actionName === 'increment' ? 10 : -10))} ref={seekBar} onLayout={measureSeekBar} onStartShouldSetResponder={() => duration > 0} onMoveShouldSetResponder={() => duration > 0} onResponderTerminationRequest={() => false} onResponderGrant={event => { const { pageX } = event.nativeEvent; measureSeekBar(); updateDrag(pageX); show(); }} onResponderMove={event => updateDrag(event.nativeEvent.pageX)} onResponderRelease={event => { updateDrag(event.nativeEvent.pageX); endDrag(true); }} onResponderTerminate={() => endDrag(false)}><View pointerEvents="none" style={styles.trackWrap}><Animated.View style={[styles.track, { transform: [{ scaleY: dragProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }]}><View style={[styles.fill, { width: `${fraction * 100}%` }]} /></Animated.View><Animated.View style={[styles.thumb, { left: `${fraction * 100}%`, transform: [{ scale: dragProgress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]} /></View></View>
        </View>
      </Animated.View>}
    </View>
    {!fullscreen && <ScrollView style={{ flex: 1 }} pointerEvents={settings || touchLock ? 'none' : 'auto'}>{!!error && (source || embed) && <Text style={[styles.error, { padding: 20 }]}>{error}</Text>}{episode && <PlayerDetails anime={anime} episode={episode} episodes={episodes} onEpisode={navigateEpisode} onAnime={() => navigation.navigate('AnimeDetail', { animeId })} />}</ScrollView>}
    <Modal visible={settings} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={closeSettings} supportedOrientations={['portrait', 'landscape']}><View style={styles.backdrop}><TouchableOpacity style={{ flex: 1 }} accessibilityLabel="Fermer les options" onPress={closeSettings} /><View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom) }]}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Options de lecture</Text>{icon('close', 'Fermer', closeSettings)}</View><ScrollView style={{ maxHeight: height * 0.6 }}>
      {source && <><Text style={styles.optionLabel}>Vitesse de lecture</Text><View style={styles.speeds}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => <TouchableOpacity key={rate} accessibilityState={{ selected: speed === rate }} onPress={() => setSpeed(rate)} style={[styles.speed, speed === rate && { backgroundColor: colors.buttonBg }]}><Text style={{ color: 'white' }}>{rate}×</Text></TouchableOpacity>)}</View><View style={styles.optionRow}><Text style={styles.optionLabel}>Enchaîner les épisodes</Text><Switch value={autoNext} onValueChange={setAutoNext} trackColor={{ true: colors.buttonBg }} /></View></>}
      {!!sources.length && <><Text style={styles.optionLabel}>Sources vidéo</Text>{sources.map((option, index) => <TouchableOpacity key={`${option.url}-${index}`} style={styles.optionRow} onPress={() => { player.pause(); setEmbed(''); setSource({ uri: option.url }); setError(''); closeSettings(); show(); }}><Text style={styles.optionText}>{option.label}</Text></TouchableOpacity>)}</>}
      {!isOfflineMode && <><Text style={styles.optionLabel}>Serveurs</Text>{servers.map((server, index) => <TouchableOpacity key={`${server.url}-${index}`} style={styles.optionRow} onPress={() => { player.pause(); setSource(null); setEmbed(server.url); setError(''); closeSettings(); }}><Text style={[styles.optionText, embed === server.url && { color: colors.primary }]}>{server.name || `Lecteur ${index + 1}`}{server.langue ? ` • ${server.langue}` : ''}</Text>{embed === server.url && <Ionicons name="checkmark" size={22} color={colors.primary} />}</TouchableOpacity>)}{!servers.length && <Text style={styles.error}>Aucun serveur supplémentaire.</Text>}</>}
    </ScrollView></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000' }, video: { width: '100%', backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, icon: { padding: 10 }, overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' }, scrim: { backgroundColor: 'rgba(0,0,0,0.25)' }, scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '40%' }, scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%' }, top: { flexDirection: 'row', alignItems: 'flex-start' }, titles: { flex: 1, paddingTop: 6, paddingRight: 12 }, overlayTitle: { color: 'white', fontWeight: '500' }, overlaySubtitle: { color: 'rgba(255,255,255,0.65)', marginTop: 4 }, actions: { flexDirection: 'row', alignItems: 'center', opacity: 0.9 }, control: { padding: 6, alignItems: 'center', justifyContent: 'center' }, center: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, playButton: { alignItems: 'center', justifyContent: 'center' }, seekHint: { position: 'absolute', top: 0, bottom: 0, width: '35%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' }, seekHintText: { color: 'white', fontSize: 14, fontWeight: '600', marginTop: 4 }, seek: { height: 44, justifyContent: 'center' }, trackWrap: { height: 4 }, track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.24)' }, fill: { height: 4, backgroundColor: colors.primary }, thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'white', position: 'absolute', marginLeft: -10, top: -8 }, timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, time: { color: 'white', fontSize: 12, fontVariant: ['tabular-nums'] }, offline: { color: colors.primary, fontSize: 11 }, embedToolbar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center' }, empty: { alignItems: 'center', gap: 14, padding: 20 }, error: { color: colors.textSecondary, fontSize: 13, lineHeight: 21 }, retry: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: colors.buttonBg, borderRadius: radii.pill }, backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }, sheet: { backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: 'white', fontSize: 20, fontWeight: '700' }, optionLabel: { color: colors.textSecondary, fontSize: 14, marginVertical: 12 }, optionText: { color: 'white', fontSize: 15 }, optionRow: { paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, speeds: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }, speed: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colors.card } });
