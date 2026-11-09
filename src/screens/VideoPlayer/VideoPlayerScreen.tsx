import { radii } from '../../theme/shape';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, ActivityIndicator, BackHandler, Platform } from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView, VideoSource } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackScreenProps } from '../../types/navigation';
import { Anime, Episode, StreamingServer } from '../../types/anime';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import { isFinished } from '../../utils/watchProgress';
import * as malSync from '../../services/mal/malSync';
import { getFavoriteHosts } from '../../services/preferences';
import { getBackgroundPlayback } from '../../services/preferences';
import { AppState } from 'react-native';
import { hostOf, orderServers, probeServer, StreamProbe } from '../../services/streamHosts';
import WebViewVideoPlayer from '../../components/WebViewVideoPlayer';
import useReducedMotion from '../../hooks/useReducedMotion';
import { MotionPressable } from '../../components/Motion';
import { motion } from '../../theme/tokens';
import { palette } from '../../theme/palette';
import PlayerDetails from './PlayerDetails';
import PlayerSettingsSheet, { Page, ServerChoice } from './PlayerSettingsSheet';
import useStutterDetector from './useStutterDetector';
import { pickSkips, SkipResult } from '../../utils/skipTimes';

const colors = palette.dark;
const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const directUrl = (url: string) => /^https?:\/\//i.test(url) && /\.(m3u8|mp4|webm|mov)(?:[?#]|$)/i.test(url);
type SourceOption = { label: string; url: string };
// Délai au-delà duquel un flux qui ne démarre pas est considéré comme hors service.
const START_TIMEOUT = 25000;
export default function VideoPlayerScreen({ route, navigation }: RootStackScreenProps<'VideoPlayer'>) {
  const { episodeId, animeId, autoPlay = false, localFilePath, isOfflineMode = false, startFullscreen = false } = route.params;
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
  const [fullscreen, setFullscreen] = useState(startFullscreen);
  // Vrai quand on remplace l'écran par l'épisode suivant : il gère lui-même l'orientation.
  const keepOrientation = useRef(false);
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
  const [settingsPage, setSettingsPage] = useState<Page>('main');
  const [ordered, setOrdered] = useState<StreamingServer[]>([]);
  const [probes, setProbes] = useState<Record<string, StreamProbe | 'checking'>>({});
  const [active, setActive] = useState('');
  const [notice, setNotice] = useState('');
  const [stutterOff, setStutterOff] = useState(false);
  const [background, setBackground] = useState(false);
  const [skipTimes, setSkipTimes] = useState<SkipResult[]>([]);
  const [durationWidth, setDurationWidth] = useState(32);
  const [stutterHeight, setStutterHeight] = useState(44);
  const skipIn = useRef(new Animated.Value(0)).current;
  const probeCache = useRef<Record<string, Promise<StreamProbe>>>({});
  const order = useRef<StreamingServer[]>([]);
  const activeRef = useRef('');
  const manualChoice = useRef(false);
  const session = useRef(0);
  // Chaque choix de lecteur (auto ou manuel) prend un nouveau jeton : un résultat d'extraction arrivé après un choix plus récent est ignoré.
  const pick = useRef(0);
  const [frame, setFrame] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const remounts = useRef(0);
  const streamHeaders = useRef<Record<string, string>>({});
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failRef = useRef<(reason: string) => void>(() => {});
  const failedUrl = useRef('');
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
  // Un même lien apparaît souvent sous plusieurs noms (« Serveur 2 », « OneUpload »…) : une ligne par lien, nommée d'après l'hébergeur.
  const choices = useMemo<ServerChoice[]>(() => {
    const seen: Record<string, number> = {};
    const total: Record<string, number> = {};
    ordered.forEach(server => { const id = hostOf(server.url).id; total[id] = (total[id] ?? 0) + 1; });
    return ordered.map(server => {
      const host = hostOf(server.url);
      seen[host.id] = (seen[host.id] ?? 0) + 1;
      const state = probes[server.url];
      const label = `${host.label}${total[host.id] > 1 ? ` ${seen[host.id]}` : ''}${server.langue ? ` • ${server.langue.toUpperCase()}` : ''}`;
      if (!state) return { url: server.url, label, status: 'idle' };
      if (state === 'checking') return { url: server.url, label, status: 'checking' };
      return { url: server.url, label, status: state.status, detail: state.status === 'ok' ? undefined : state.reason, quality: state.status === 'ok' && state.height ? `${state.height}p` : undefined };
    });
  }, [ordered, probes]);
  // Suggestion de changer de lecteur si la lecture native saccade ; inutile sans autre lecteur disponible.
  const stutter = useStutterDetector(player, `${episodeId}|${active}`, !!source && !embed && !loading && !error && !stutterOff && !isOfflineMode && choices.length > 1);
  const labelOf = (url: string) => choices.find(choice => choice.url === url)?.label.split(' • ')[0] ?? hostOf(url).label;
  const probe = (server: StreamingServer, fresh = false) => {
    const cached = probeCache.current[server.url];
    if (cached && !fresh) return cached;
    const id = session.current;
    setProbes(value => ({ ...value, [server.url]: 'checking' }));
    const pending = probeServer(server).then(result => { if (session.current === id) setProbes(value => ({ ...value, [server.url]: result })); return result; });
    probeCache.current[server.url] = pending;
    return pending;
  };
  const markDead = (url: string, reason: string) => {
    const result: StreamProbe = { status: 'dead', reason };
    probeCache.current[url] = Promise.resolve(result);
    setProbes(value => ({ ...value, [url]: result }));
  };
  const keepPosition = () => { const value = progressRef.current; if (value.duration > 0) resumePercent.current = value.time / value.duration * 100; };
  const start = (server: StreamingServer, result: StreamProbe) => {
    activeRef.current = server.url; failedUrl.current = ''; setActive(server.url); setError('');
    if (result.status === 'ok') {
      streamHeaders.current = result.headers;
      setEmbed('');
      // Qualités lues dans le manifeste HLS ; un flux sans variantes n'affiche que sa résolution si elle est connue.
      setSources(result.qualities.length ? result.qualities : result.height ? [{ label: `${result.height}p`, url: result.url }] : []);
      setSource({ uri: result.url, headers: result.headers });
    } else { player.pause(); setSource(null); setSources([]); setEmbed(server.url); }
  };
  // Lecteurs testés dans l'ordre des favoris : le premier dont le flux s'extrait passe en lecture native, sinon le premier lecteur web plausible.
  // null : la recherche a été remplacée par un choix plus récent, qui gère lui-même le chargement.
  const playFirst = async (): Promise<boolean | null> => {
    const id = ++pick.current;
    const sessionId = session.current;
    let fallback: StreamingServer | undefined;
    for (const server of order.current) {
      const result = await probe(server);
      if (pick.current !== id || session.current !== sessionId) return null;
      if (result.status === 'ok') { start(server, result); return true; }
      if (result.status === 'embed' && !fallback) fallback = server;
    }
    if (fallback) { start(fallback, { status: 'embed', reason: '' }); return true; }
    return false;
  };
  const failActive = (reason: string) => {
    const url = activeRef.current;
    // Le lecteur web peut signaler plusieurs fois la même panne.
    if (!url || failedUrl.current === url) return;
    failedUrl.current = url;
    if (startTimer.current) { clearTimeout(startTimer.current); startTimer.current = null; }
    const label = labelOf(url);
    markDead(url, reason);
    player.pause(); keepPosition(); setSource(null); setEmbed(''); setSources([]);
    // Un lecteur choisi à la main n'est pas remplacé d'office : on explique et on propose d'en changer.
    if (manualChoice.current) { setError(`${label} est hors service (${reason.toLowerCase()}). Choisissez un autre lecteur.`); return; }
    setLoading(true);
    void playFirst().then(found => {
      if (found === null) return;
      setLoading(false);
      if (found) setNotice(`${label} est hors service (${reason.toLowerCase()}) : lecture sur ${labelOf(activeRef.current)}.`);
      else setError(`${label} est hors service et aucun autre lecteur ne fonctionne pour cet épisode.`);
    });
  };
  failRef.current = failActive;
  const selectServer = async (choice: ServerChoice) => {
    const server = order.current.find(item => item.url === choice.url);
    if (!server || (choice.url === activeRef.current && !error && (source || embed))) return;
    const id = ++pick.current;
    manualChoice.current = true;
    keepPosition(); player.pause(); setSource(null); setEmbed(''); setSources([]); setError(''); setNotice('');
    activeRef.current = server.url; setActive(server.url); setLoading(true);
    // Un lecteur déjà validé repart directement ; les autres sont re-testés (il a pu revenir depuis).
    const result = await probe(server, choice.status !== 'ok');
    if (pick.current !== id) return;
    setLoading(false);
    if (result.status === 'dead') setError(`${choice.label.split(' • ')[0]} est hors service (${result.reason.toLowerCase()}). Choisissez un autre lecteur.`);
    else start(server, result);
  };
  const openServers = () => { setSettingsPage('server'); setSettings(true); };
  const navigateEpisode = useCallback((item: Episode) => { player.pause(); keepOrientation.current = true; navigation.replace('VideoPlayer', { animeId, episodeId: item.id, autoPlay: true, startFullscreen: fullscreen }); }, [animeId, navigation, player, fullscreen]);
  const show = useCallback(() => { opacity.stopAnimation(); setControls(true); setControlsActivity(value => value + 1); Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 160, useNativeDriver: true }).start(); }, [opacity, reduced]);
  const saveProgress = useCallback(() => {
    const value = progressRef.current;
    if (value.duration <= 0 || !episode) return;
    const progress = Math.max(0, Math.min(100, value.time / value.duration * 100));
    void databaseService.updateWatchHistory(animeId, episodeId, progress).catch(() => {});
    void databaseService.updateEpisodeProgress(episodeId, progress, isFinished(progress)).catch(() => {});
    // Quitter pendant le générique de fin compte l'épisode comme vu.
    if (isFinished(progress)) void malSync.episodeWatched(animeId, episode);
  }, [animeId, episodeId, episode]);
  useEffect(() => {
    void ScreenOrientation.lockAsync(startFullscreen ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return () => { if (!keepOrientation.current) void ScreenOrientation.unlockAsync().catch(() => {}); opacity.stopAnimation(); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [opacity]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSource(null); setEmbed(''); setSources([]); setEpisode(null); setEpisodes([]); setAnime(null); setTime(0); setDuration(0); player.pause();
    session.current += 1; pick.current += 1; probeCache.current = {}; order.current = []; activeRef.current = ''; manualChoice.current = false;
    setProbes({}); setOrdered([]); setActive(''); setNotice(''); setStutterOff(false);
    progressRef.current = { time: 0, duration: 0 }; lastSave.current = 0; resumePercent.current = 0;
    let superseded = false;
    const load = async () => {
      try {
        let item: Episode;
        let list: Episode[];
        let animeData: Anime | null;
        if (isOfflineMode) {
          list = await databaseService.getAnimeEpisodes(animeId);
          const local = list.find(candidate => candidate.id === episodeId);
          if (!local) throw new Error('Les informations de cet épisode ne sont pas disponibles hors ligne.');
          item = local; resumePercent.current = !isFinished(local.watchProgress) ? local.watchProgress : 0; animeData = await databaseService.getAnime(animeId);
        } else {
          list = []; animeData = null;
          const metadata = apiService.getAnimeById(animeId).then(data => { if (active) setAnime(data); return data; }).catch(() => null);
          item = await apiService.getEpisodeById(episodeId);
          const history = await databaseService.getWatchHistory(100).catch(() => []);
          const saved = history.find(entry => entry.episodeId === episodeId);
          resumePercent.current = saved && !isFinished(saved.progress) ? saved.progress : 0;
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
        const servers = (item.streaming_servers ?? []).filter((server, index, list) => /^https?:\/\//i.test(server.url) && list.findIndex(other => other.url === server.url) === index);
        order.current = orderServers(servers, await getFavoriteHosts());
        if (!active) return;
        setOrdered(order.current);
        const options: SourceOption[] = (item.streamingUrls ?? []).filter(value => directUrl(value.url)).map(value => ({ label: value.quality || 'Auto', url: value.url }));
        if (options.length) { setSources(options); setSource({ uri: options[0].url }); return; }
        if (!order.current.length) { setError('Aucun lecteur disponible pour cet épisode.'); return; }
        const found = await playFirst();
        if (!active) return;
        if (found === null) superseded = true;
        else if (!found) setError('Tous les lecteurs de cet épisode sont hors service. Réessayez plus tard.');
        // Les autres lecteurs sont testés en arrière-plan pour afficher leur état et leur qualité dans la liste.
        order.current.forEach(server => { void probe(server); });
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : 'Impossible de charger cet épisode.'); }
      finally { if (active && !superseded) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [episodeId, animeId, attempt, isOfflineMode, localFilePath, player]);
  const loadedEpisode = episode?.id;
  useEffect(() => {
    let active = true;
    setSkipTimes([]);
    if (loadedEpisode && !isOfflineMode) void apiService.getSkipTimes(loadedEpisode).then(values => { if (active) setSkipTimes(values); }).catch(() => {});
    return () => { active = false; };
  }, [loadedEpisode, isOfflineMode]);
  useEffect(() => {
    let active = true;
    if (startTimer.current) clearTimeout(startTimer.current);
    setFrame(false); remounts.current = 0; setStatus(source ? 'loading' : 'idle');
    if (source && activeRef.current) startTimer.current = setTimeout(() => { startTimer.current = null; if (active) failRef.current('Délai de lecture dépassé'); }, START_TIMEOUT);
    void player.replaceAsync(source).then(() => { if (active && source) { player.playbackRate = speed; if (autoPlay || manualChoice.current) player.play(); } }).catch(() => { if (!active || !source) return; if (activeRef.current) failRef.current('Source illisible'); else setError('Le lecteur n’a pas pu ouvrir cette source. Essayez un autre serveur.'); });
    return () => { active = false; if (startTimer.current) { clearTimeout(startTimer.current); startTimer.current = null; } };
  }, [source, player]);
  useEffect(() => { player.playbackRate = speed; }, [player, speed]);
  // Filet de sécurité Android : si la lecture tourne sans première image, la surface est restée masquée sur une ancienne vue ; on remonte la vue une fois.
  useEffect(() => {
    if (!source || embed || frame || !playing) return;
    const timer = setTimeout(() => { if (remounts.current < 1) { remounts.current += 1; setViewKey(value => value + 1); } else setFrame(true); }, 2500);
    return () => clearTimeout(timer);
  }, [source, embed, frame, playing, viewKey]);
  // Changer de page laisse cet écran monté dans la pile : sans pause, le son continue en arrière-plan.
  useEffect(() => { if (!focused) { player.pause(); saveProgress(); } }, [focused, player, saveProgress]);
  // Plein écran : barre de navigation (poignée ou boutons) masquée en immersif ; un balayage depuis le bord la fait réapparaître un instant. Seule la visibilité est touchée, pour ne pas imposer de style aux menus.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setHidden(fullscreen && focused);
    return () => NavigationBar.setHidden(false);
  }, [fullscreen, focused]);
  // Option relue au retour sur l'écran (elle a pu changer dans les Paramètres).
  useEffect(() => { if (focused) void getBackgroundPlayback().then(setBackground); }, [focused]);
  useEffect(() => { player.staysActiveInBackground = background; player.showNowPlayingNotification = background; }, [player, background]);
  // Hors de l'app (écran verrouillé, autre app), la vidéo se met en pause sauf si la lecture en arrière-plan est autorisée.
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active' && !background) { player.pause(); saveProgress(); } });
    return () => listener.remove();
  }, [player, background, saveProgress]);
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
  useEffect(() => {
    const listeners = [
      player.addListener('timeUpdate', event => { const pending = pendingSeek.current; if (pending) { if (Date.now() < pending.until && Math.abs(event.currentTime - pending.target) > 1.5) return; pendingSeek.current = null; } setTime(event.currentTime); setDuration(player.duration); progressRef.current = { time: event.currentTime, duration: player.duration }; if (Date.now() - lastSave.current > 10000) { lastSave.current = Date.now(); saveProgress(); } }),
      player.addListener('playingChange', event => setPlaying(event.isPlaying)),
      player.addListener('statusChange', event => { setStatus(event.status); if (event.status === 'readyToPlay') setDuration(player.duration); if (event.status === 'readyToPlay' && resumePercent.current > 0 && player.duration > 0) { player.currentTime = player.duration * Math.min(100, resumePercent.current) / 100; resumePercent.current = 0; } if (event.status === 'readyToPlay' && startTimer.current) { clearTimeout(startTimer.current); startTimer.current = null; } if (event.status === 'error') { if (activeRef.current) failRef.current('Lecture impossible'); else setError('Impossible de lire cette source. Sélectionnez un autre lecteur.'); show(); } }),
      // Changer de lecteur remplace la source et peut émettre playToEnd : on n'enchaîne que si la lecture était vraiment à la fin.
      player.addListener('playToEnd', () => { const value = progressRef.current; if (value.duration <= 0 || value.time < value.duration - 3) return; saveProgress(); show(); if (autoNext && next) navigateEpisode(next); }),
    ];
    return () => { listeners.forEach(listener => listener.remove()); saveProgress(); };
  }, [player, saveProgress, show, autoNext, next, navigateEpisode]);
  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing && frame && controls && !settings && drag === null) hideTimer.current = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: reduced ? 0 : 220, useNativeDriver: true }).start(({ finished }) => { if (finished) setControls(false); }), 3500);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [playing, frame, controls, settings, drag, opacity, reduced, controlsActivity]);
  const toggleFullscreen = async () => { const target = !fullscreen; setFullscreen(target); show(); try { await ScreenOrientation.lockAsync(target ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch { setError('La rotation automatique n’est pas disponible sur cet appareil.'); } };
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => { if (!fullscreen) return false; void toggleFullscreen(); return true; }); return () => listener.remove(); }, [fullscreen]);
  const seek = (position: number, reveal = true) => { if (!duration) return; const target = Math.max(0, Math.min(duration, position)); stutter.markSeek(); pendingSeek.current = { target, until: Date.now() + 2000 }; progressRef.current = { time: target, duration }; player.currentTime = target; setTime(target); if (reveal) show(); };
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
    stutter.markSeek(); player.currentTime = target; setTime(target);
    setSeekHint(hint => ({ side, amount: (hint?.side === side ? hint.amount : 0) + 10 }));
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setSeekHint(null), 700);
  };
  const closeSettings = () => { setSettings(false); setTouchLock(true); setTimeout(() => setTouchLock(false), 500); };
  const ui = fullscreen ? { side: 48, title: 20, subtitle: 15, icon: 30, skip: 44, play: 72, gap: 120 } : { side: 12, title: 15, subtitle: 12, icon: 24, skip: 34, play: 52, gap: 44 };
  const control = (name: React.ComponentProps<typeof MaterialIcons>['name'], label: string, action: () => void, size = ui.icon) => <MotionPressable pressedScale={0.88} accessibilityLabel={label} onPress={() => { action(); show(); }} hitSlop={8} style={styles.control}><MaterialIcons name={name} color="white" size={size} /></MotionPressable>;
  const skips = useMemo(() => pickSkips(skipTimes, duration), [skipTimes, duration]);
  const skip = !embed && source && !loading && drag === null ? skips.find(item => time >= item.start && time < item.end - 1) : undefined;
  // Un ending qui va jusqu'au bout de la vidéo mène directement à l'épisode suivant.
  const skipToNext = skip?.kind === 'outro' && !!next && duration - skip.end < 15;
  const skipLabel = skipToNext ? 'Épisode suivant' : skip?.kind === 'intro' ? 'Passer l’intro' : skip?.kind === 'recap' ? 'Passer le récap' : 'Passer l’ending';
  const skipKey = skip ? `${skip.kind}-${skip.start}` : '';
  useEffect(() => {
    if (!skipKey) { skipIn.setValue(0); return; }
    Animated.timing(skipIn, { toValue: 1, duration: reduced ? 0 : motion.duration.short, easing: motion.easing.decelerate, useNativeDriver: true }).start();
  }, [skipKey, reduced, skipIn]);
  // Comme Crunchyroll : coin bas droit, visible que les commandes soient affichées ou non. Commandes masquées, il se cale dans le coin ;
  // affichées, il remonte au-dessus de la barre (plein écran) ou se range à gauche de la durée (portrait, pour ne pas toucher le bouton +10 s).
  const stutterShown = stutter.stuttering && !embed && !!source && !loading;
  const skipBase = fullscreen ? Math.max(8, insets.bottom) + 16 : 12;
  const skipBottom = stutterShown ? (fullscreen ? 72 : 56) + stutterHeight + 8 : skipBase;
  const skipLift = stutterShown ? 0 : fullscreen ? 56 : 25;
  const skipShift = stutterShown || fullscreen ? 0 : durationWidth + 12;
  const seriesTitle = anime?.title || episode?.animeTitle || '';
  const episodeTitle = episode ? `E${episode.number} - ${episode.title || episode.titre_episode || `Épisode ${episode.number}`}` : '';
  // Même barre du haut pendant le chargement, une erreur ou un lecteur web que sur le lecteur natif : sinon d'anciennes icônes s'affichaient le temps de l'ouverture.
  const topBar = <View pointerEvents="box-none" style={styles.top}>
    {!fullscreen && <TouchableOpacity accessibilityLabel="Retour" onPress={() => navigation.goBack()} hitSlop={8} style={[styles.control, { marginLeft: -8 }]}><Ionicons name="chevron-down" color="white" size={ui.icon} /></TouchableOpacity>}
    <View pointerEvents="none" style={styles.titles}><Text numberOfLines={1} style={[styles.overlayTitle, { fontSize: ui.title }]}>{seriesTitle}</Text>{!!episodeTitle && <Text numberOfLines={1} style={[styles.overlaySubtitle, { fontSize: ui.subtitle }]}>{episodeTitle}</Text>}</View>
    <View style={[styles.actions, { gap: fullscreen ? 28 : 6 }]}>
      {next && control('skip-next', 'Épisode suivant', () => navigateEpisode(next))}
      {control('settings', 'Paramètres du lecteur', () => { setSettingsPage('main'); setSettings(true); })}
      <TouchableOpacity accessibilityLabel={fullscreen ? 'Quitter le plein écran' : 'Plein écran'} onPress={() => void toggleFullscreen()} hitSlop={8} style={styles.control}><MaterialCommunityIcons name={fullscreen ? 'arrow-collapse' : 'arrow-expand'} color="white" size={ui.icon} /></TouchableOpacity>
    </View>
  </View>;
  return <View style={[styles.root, { paddingTop: fullscreen ? 0 : insets.top }]}><StatusBar style="light" hidden={fullscreen} />
    {/* Plein écran : flex 1 plutôt qu'une hauteur calculée depuis les dimensions, qui restent celles du portrait le temps de la rotation et poussaient la vidéo en bas de l'écran. */}
    <View style={[styles.video, fullscreen ? { flex: 1 } : { aspectRatio: 16 / 9 }]}>
      {/* Une seule VideoView pour toute la séance : la démonter pendant un chargement laissait parfois la surface de la nouvelle vue masquée (écran noir, son présent). */}
      {!embed && <VideoView key={viewKey} player={player} style={StyleSheet.absoluteFill} nativeControls={false} fullscreenOptions={{ enable: false }} contentFit="contain" allowsPictureInPicture={background} startsPictureInPictureAutomatically={background} onFirstFrameRender={() => setFrame(true)} />}
      {loading ? <View style={[StyleSheet.absoluteFill, styles.empty, styles.cover]}><ActivityIndicator size="large" color={colors.primary} />{!!ordered.length && <Text style={styles.error}>{active ? `Ouverture de ${labelOf(active)}…` : 'Recherche d’un lecteur disponible…'}</Text>}</View> : embed ? (focused ? <WebViewVideoPlayer key={embed} embedUrl={embed} background={background} onDead={reason => failRef.current(reason)} /> : null) : !source && <View style={[StyleSheet.absoluteFill, styles.empty, styles.cover]}><Ionicons name="videocam-off-outline" color={colors.textSecondary} size={36} /><Text style={[styles.error, { textAlign: 'center' }]}>{error || 'Aucun lecteur disponible.'}</Text><View style={styles.emptyActions}>{choices.length > 1 && <TouchableOpacity onPress={openServers} style={styles.retry}><Text style={{ color: 'white', fontWeight: '600' }}>Changer de lecteur</Text></TouchableOpacity>}<TouchableOpacity onPress={() => setAttempt(value => value + 1)} style={styles.retry}><Text style={{ color: 'white', fontWeight: '600' }}>Réessayer</Text></TouchableOpacity></View></View>}
      {!embed && source && !loading && <View accessible accessibilityLabel={controls ? 'Masquer les commandes' : 'Afficher les commandes'} accessibilityRole="button" onAccessibilityTap={() => controls ? hide() : show()} style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={event => handleTap(event.nativeEvent.locationX, trackArea.current)} onLayout={event => { trackArea.current = event.nativeEvent.layout.width; }} />}
      {seekHint && <View pointerEvents="none" style={[styles.seekHint, seekHint.side === 'left' ? { left: 0 } : { right: 0 }]}><MaterialIcons name={seekHint.side === 'left' ? 'fast-rewind' : 'fast-forward'} color="white" size={32} /><Text style={styles.seekHintText}>{seekHint.side === 'left' ? '-' : '+'}{seekHint.amount} s</Text></View>}
      {(embed || loading || !source) ? <View pointerEvents="box-none" style={[styles.staticBar, { paddingLeft: ui.side + (fullscreen ? insets.left : 0), paddingRight: ui.side + (fullscreen ? insets.right : 0), paddingTop: fullscreen ? 20 : 6 }]}><LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />{topBar}</View> : <Animated.View pointerEvents={controls ? 'box-none' : 'none'} style={[styles.overlay, { opacity, paddingLeft: ui.side + (fullscreen ? insets.left : 0), paddingRight: ui.side + (fullscreen ? insets.right : 0), paddingTop: fullscreen ? 20 : 6, paddingBottom: fullscreen ? Math.max(8, insets.bottom) : 0 }]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} /><LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)']} style={styles.scrimTop} /><LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']} style={styles.scrimBottom} />
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.center, { gap: ui.gap }]}>
          {control('replay-10', 'Reculer de 10 secondes', () => seek(time - 10), ui.skip)}
          <MotionPressable pressedScale={0.88} accessibilityLabel={playing ? 'Pause' : 'Lire'} onPress={() => { playing ? player.pause() : player.play(); show(); }} style={[styles.playButton, { width: ui.play + 16, height: ui.play + 16 }]}>{status === 'loading' || (playing && !frame) ? <ActivityIndicator color="white" size="large" /> : <MaterialIcons name={playing ? 'pause' : 'play-arrow'} color="white" size={ui.play} />}</MotionPressable>
          {control('forward-10', 'Avancer de 10 secondes', () => seek(time + 10), ui.skip)}
        </View>
        {topBar}
        <View pointerEvents="box-none">
          <View pointerEvents="none" style={styles.timeRow}><Text style={[styles.time, fullscreen && { fontSize: 14 }]}>{clock(drag ?? time)}</Text>{isOfflineMode && <Text style={styles.offline}>Hors ligne</Text>}<Text onLayout={event => setDurationWidth(event.nativeEvent.layout.width)} style={[styles.time, fullscreen && { fontSize: 14 }]}>{clock(duration)}</Text></View>
          <View style={styles.seek} accessibilityRole="adjustable" accessibilityLabel="Progression de lecture" accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(time), text: clock(time) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={event => seek(time + (event.nativeEvent.actionName === 'increment' ? 10 : -10))} ref={seekBar} onLayout={measureSeekBar} onStartShouldSetResponder={() => duration > 0} onMoveShouldSetResponder={() => duration > 0} onResponderTerminationRequest={() => false} onResponderGrant={event => { const { pageX } = event.nativeEvent; measureSeekBar(); updateDrag(pageX); show(); }} onResponderMove={event => updateDrag(event.nativeEvent.pageX)} onResponderRelease={event => { updateDrag(event.nativeEvent.pageX); endDrag(true); }} onResponderTerminate={() => endDrag(false)}><View pointerEvents="none" style={styles.trackWrap}><Animated.View style={[styles.track, { transform: [{ scaleY: dragProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }]}><View style={[styles.fill, { width: `${fraction * 100}%` }]} /></Animated.View><Animated.View style={[styles.thumb, { left: `${fraction * 100}%`, transform: [{ scale: dragProgress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]} /></View></View>
        </View>
      </Animated.View>}
      {stutterShown && <View onLayout={event => setStutterHeight(event.nativeEvent.layout.height)} style={[styles.stutter, fullscreen && { bottom: 72, maxWidth: 420 }]}><Ionicons name="swap-horizontal" color={colors.primary} size={18} /><Text style={styles.stutterText}>La lecture saccade ? Essayez un autre lecteur</Text><TouchableOpacity onPress={() => { stutter.dismiss(); openServers(); }} hitSlop={6}><Text style={styles.noticeAction}>Changer de lecteur</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Ignorer" onPress={() => { stutter.dismiss(); setStutterOff(true); }} hitSlop={6}><Text style={styles.stutterIgnore}>Ignorer</Text></TouchableOpacity></View>}
      {skip && <Animated.View pointerEvents="box-none" style={[styles.skipWrap, { right: ui.side + (fullscreen ? insets.right : 0), bottom: skipBottom, opacity: skipIn, transform: [{ translateX: Animated.add(skipIn.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }), opacity.interpolate({ inputRange: [0, 1], outputRange: [0, -skipShift] })) }, { translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [0, -skipLift] }) }] }]}>
        <MotionPressable pressedScale={0.94} accessibilityRole="button" accessibilityLabel={skipLabel} onPress={() => { if (skipToNext && next) navigateEpisode(next); else seek(skip.end, false); }} hitSlop={8} style={[styles.skip, fullscreen ? { height: 40, paddingHorizontal: 18 } : { height: 30, paddingHorizontal: 12 }]}><Text style={[styles.skipText, fullscreen && { fontSize: 14 }]}>{skipLabel}</Text><MaterialIcons name={skipToNext ? 'skip-next' : 'fast-forward'} color="white" size={fullscreen ? 20 : 16} /></MotionPressable>
      </Animated.View>}
    </View>
    {!fullscreen && <ScrollView style={{ flex: 1 }} pointerEvents={settings || touchLock ? 'none' : 'auto'}>{!!(notice || (error && (source || embed))) && <TouchableOpacity accessibilityRole="button" onPress={openServers} style={styles.notice}><Ionicons name="swap-horizontal" color={colors.primary} size={18} /><Text style={[styles.error, { flex: 1 }]}>{error && (source || embed) ? error : notice}</Text><Text style={styles.noticeAction}>Lecteurs</Text></TouchableOpacity>}{episode && <PlayerDetails anime={anime} episode={episode} episodes={episodes} onEpisode={navigateEpisode} onAnime={() => navigation.navigate('AnimeDetail', { animeId })} />}</ScrollView>}
    <PlayerSettingsSheet visible={settings} onClose={closeSettings} reduced={reduced} nativePlayback={!!source && !embed}
      speed={speed} onSpeed={setSpeed} autoNext={autoNext} onAutoNext={setAutoNext}
      qualities={sources} currentQuality={source && typeof source === 'object' ? source.uri : undefined} onQuality={option => { if (source && typeof source === 'object' && source.uri === option.url) return; keepPosition(); player.pause(); setEmbed(''); setSource({ uri: option.url, headers: activeRef.current ? streamHeaders.current : undefined }); setError(''); show(); }}
      servers={isOfflineMode ? undefined : choices} currentServer={active} onServer={choice => void selectServer(choice)} startPage={settingsPage} />
  </View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000' }, video: { width: '100%', backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' }, scrim: { backgroundColor: 'rgba(0,0,0,0.25)' }, scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '40%' }, scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%' }, top: { flexDirection: 'row', alignItems: 'flex-start' }, titles: { flex: 1, paddingTop: 6, paddingRight: 12 }, overlayTitle: { color: 'white', fontWeight: '500' }, overlaySubtitle: { color: 'rgba(255,255,255,0.65)', marginTop: 4 }, actions: { flexDirection: 'row', alignItems: 'center', opacity: 0.9 }, control: { padding: 6, alignItems: 'center', justifyContent: 'center' }, center: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, playButton: { alignItems: 'center', justifyContent: 'center' }, seekHint: { position: 'absolute', top: 0, bottom: 0, width: '35%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' }, seekHintText: { color: 'white', fontSize: 14, fontWeight: '600', marginTop: 4 }, seek: { height: 44, justifyContent: 'center' }, trackWrap: { height: 4 }, track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.24)' }, fill: { height: 4, backgroundColor: colors.primary }, thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'white', position: 'absolute', marginLeft: -10, top: -8 }, timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, time: { color: 'white', fontSize: 12, fontVariant: ['tabular-nums'] }, offline: { color: colors.primary, fontSize: 11 }, staticBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 16 }, empty: { alignItems: 'center', gap: 14, padding: 20 }, cover: { backgroundColor: '#000', justifyContent: 'center' }, emptyActions: { flexDirection: 'row', gap: 10 }, notice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: radii.control, backgroundColor: colors.surface }, noticeAction: { color: colors.primary, fontWeight: '600', fontSize: 13 }, stutter: { position: 'absolute', left: 12, right: 12, bottom: 56, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 10, borderRadius: radii.control, backgroundColor: 'rgba(28,30,39,0.94)' }, stutterText: { color: 'white', fontSize: 13, flexShrink: 1, flexGrow: 1 }, stutterIgnore: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 }, skipWrap: { position: 'absolute' }, skip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 4, backgroundColor: colors.buttonBg, elevation: 4 }, skipText: { color: colors.buttonText, fontWeight: '700', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' }, error: { color: colors.textSecondary, fontSize: 13, lineHeight: 21 }, retry: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: colors.buttonBg, borderRadius: radii.pill } });
