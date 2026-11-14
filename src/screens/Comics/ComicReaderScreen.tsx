import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, GestureResponderEvent, Image, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { GestureDetector, usePinchGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackScreenProps } from '../../types/navigation';
import { palette } from '../../theme/palette';
import { radii } from '../../theme/shape';
import AuthImage from '../../components/AuthImage';
import CustomModal from '../../components/CustomModal';
import databaseService from '../../services/databaseService';
import { READER_DEFAULTS, ReaderSettings, getReaderSettings, saveComicLanguage, saveReaderSettings } from '../../services/preferences';
import { Comic, ComicChapter, ComicPage, LanguageInfo, chapterLabel, getChaptersCached, getLanguageInfoCached, getProvider } from '../../services/comics';
import { languageName, sortLanguages } from '../../services/comics/languages';
import { NAVIGATION_LABELS, NavigationLayout, navigationAction } from '../../services/comics/mihon/viewerNavigation';
import { arrowAction, displayOrder, fitSpread, positionAt, prefixOffsets, scrollFor, spreadOf, spreads } from './readerLayout';
import { pickEquivalentChapter } from './equivalentChapter';
import { imageHeaders } from '../../services/comics/opds';

const colors = palette.dark;
// Ratio hauteur/largeur supposé d'une page tant que son image n'est pas chargée.
const DEFAULT_ASPECT = 1.45;
const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3, 4];
const web = Platform.OS === 'web';

interface ImageProps { page: ComicPage; index: number; width: number; height: number; onAspect: (index: number, aspect: number) => void; onRetry: () => void }

/** Une page : image principale, puis version compressée, puis message d'erreur avec reprise. */
const PageImage = memo(function PageImage({ page, index, width, height, onAspect, onRetry }: ImageProps) {
  const [source, setSource] = useState<'main' | 'fallback' | 'failed'>('main');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setSource('main'); setLoaded(false); }, [page.url]);
  const uri = source === 'fallback' ? page.fallbackUrl! : page.url;
  if (source === 'failed' || !page.url) return <View style={[styles.missing, { width, height: Math.min(height, 420) }]}>
    <Ionicons name="image-outline" size={34} color={colors.textSecondary} />
    <Text style={styles.muted}>Page {index + 1} indisponible</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => { setSource('main'); setLoaded(false); onRetry(); }} style={styles.pill}><Text style={styles.pillText}>Réessayer</Text></TouchableOpacity>
  </View>;
  return <View style={{ width, height }}>
    <AuthImage uri={uri} accessibilityLabel={`Page ${index + 1}`} style={{ width, height }} resizeMode="contain" resizeMethod="resize" progressiveRenderingEnabled
      onLoad={event => {
        setLoaded(true);
        const size = (event.nativeEvent as any)?.source;
        if (size?.width && size?.height) onAspect(index, size.height / size.width);
        else Image.getSize(uri, (w, h) => { if (w && h) onAspect(index, h / w); }, () => {});
      }}
      onError={() => setSource(source === 'main' && page.fallbackUrl ? 'fallback' : 'failed')} />
    {!loaded && <View style={styles.loader} pointerEvents="none"><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>{index + 1}</Text></View>}
  </View>;
});

export default function ComicReaderScreen({ route, navigation }: RootStackScreenProps<'ComicReader'>) {
  const { provider, comicId, chapterId, language } = route.params;
  const source = getProvider(provider);
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [comic, setComic] = useState<Comic | null>(null);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [pages, setPages] = useState<ComicPage[]>([]);
  const [chapters, setChapters] = useState<ComicChapter[]>([]);
  const [aspects, setAspects] = useState<number[]>([]);
  const [position, setPosition] = useState({ page: 0, offset: 0 });
  const [lastSeen, setLastSeen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState('');
  // Langues vérifiées pour le changement de traduction (chargées à la demande).
  const [languages, setLanguages] = useState<Record<string, LanguageInfo | 'loading' | 'error'> | null>(null);
  const list = useRef<FlatList<ComicPage>>(null);
  const scrollY = useRef(0);
  const target = useRef<{ page: number; offset: number } | null>(null);
  const interacted = useRef(false);

  const mode = settings?.mode ?? 'single';
  const vertical = mode === 'vertical';
  const index = chapters.findIndex(chapter => chapter.id === chapterId);
  const chapter = chapters[index];
  const previousChapter = index > 0 ? [...chapters.slice(0, index)].reverse().find(item => item.available) : undefined;
  const nextChapter = index >= 0 ? chapters.slice(index + 1).find(item => item.available) : undefined;

  // --- Chargement : titre, pages, chapitres, réglages du type de contenu et position enregistrée ---
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setPages([]); setAspects([]); setLastSeen(0);
    interacted.current = false;
    void getChaptersCached(provider, comicId, language).then(items => { if (active) setChapters(items); }).catch(() => {});
    (async () => {
      const [item, loaded, saved] = await Promise.all([
        source.getComic(comicId).catch(() => null),
        source.getPages(chapterId),
        route.params.page === undefined ? databaseService.getComicProgress(comicId).catch(() => [] as Awaited<ReturnType<typeof databaseService.getComicProgress>>) : Promise.resolve([]),
      ]);
      if (!active) return;
      if (item) setComic(item);
      setSettings(await getReaderSettings(item?.kind ?? 'manga'));
      if (!loaded.length) { setError('Ce chapitre n’a aucune page disponible.'); return; }
      // Position de ce chapitre dans cette traduction uniquement.
      const row = saved.find(entry => entry.chapterId === chapterId && (!source.getLanguageInfo || entry.language === language));
      const stored = row ? { page: row.page, offset: row.offset || 0 } : { page: 0, offset: 0 };
      const requested = route.params.page === undefined ? stored : { page: route.params.page < 0 ? loaded.length - 1 : route.params.page, offset: route.params.offset || 0 };
      const start = { page: Math.min(Math.max(requested.page, 0), loaded.length - 1), offset: requested.offset };
      target.current = start;
      setAspects(loaded.map(() => DEFAULT_ASPECT));
      setPosition(start);
      setPages(loaded);
    })().catch(failure => { if (active) setError(failure?.message || 'Ce chapitre ne peut pas être chargé.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [provider, comicId, chapterId, attempt]);

  // --- Mise en page verticale : largeur de lecture, hauteurs connues, décalages ---
  const columnWidth = settings ? Math.min(box.width, box.width >= 760 ? settings.readerWidth : box.width) * settings.zoom : box.width;
  const offsets = useMemo(() => prefixOffsets(aspects.map(aspect => aspect * columnWidth)), [aspects, columnWidth]);
  const topPadding = chrome ? 56 + insets.top : insets.top;

  const jumpVertical = useCallback((place: { page: number; offset: number }) => {
    if (!list.current || offsets.length < 2) return;
    list.current.scrollToOffset({ offset: scrollFor(place.page, place.offset, offsets), animated: false });
  }, [offsets]);

  // Reprise exacte : on revient à la position tant que l'utilisateur n'a pas bougé (les hauteurs se précisent au chargement).
  useEffect(() => {
    if (!vertical || !pages.length || !target.current || interacted.current) return;
    const place = target.current;
    const timer = setTimeout(() => jumpVertical(place), 30);
    return () => clearTimeout(timer);
  }, [vertical, pages, offsets, jumpVertical]);

  const onAspect = useCallback((page: number, aspect: number) => {
    setAspects(previous => {
      if (!previous.length || Math.abs(previous[page] - aspect) < 0.005) return previous;
      const next = [...previous]; next[page] = aspect;
      return next;
    });
  }, []);
  // Une page au-dessus de l'écran change de hauteur : on décale d'autant pour ne pas faire sauter la lecture.
  const previousOffsets = useRef<number[]>([]);
  useEffect(() => {
    const before = previousOffsets.current;
    previousOffsets.current = offsets;
    if (!vertical || !interacted.current || before.length !== offsets.length) return;
    const page = positionAt(scrollY.current, before).page;
    const delta = offsets[page] - before[page];
    if (Math.abs(delta) > 1) { scrollY.current += delta; list.current?.scrollToOffset({ offset: scrollY.current, animated: false }); }
  }, [offsets, vertical]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollY.current = y;
    if (!interacted.current) return;
    const place = positionAt(y, offsets);
    setPosition(previous => previous.page === place.page && Math.abs(previous.offset - place.offset) < 0.02 ? previous : place);
    setLastSeen(seen => Math.max(seen, positionAt(y + box.height - 1, offsets).page));
  };

  // --- Mode paginé ---
  const spreadList = useMemo(() => spreads(pages.length, mode), [pages.length, mode]);
  const spreadIndex = Math.min(spreadOf(position.page, mode), Math.max(spreadList.length - 1, 0));
  const currentSpread = spreadList[spreadIndex] || [];
  useEffect(() => {
    if (vertical || !currentSpread.length) return;
    setLastSeen(seen => Math.max(seen, currentSpread[currentSpread.length - 1]));
    // Préchargement de l'écran suivant.
    // (sauf serveurs protégés : le préchargement n'envoie pas d'identifiants)
    (spreadList[spreadIndex + 1] || []).forEach(page => { if (pages[page]?.url && !imageHeaders(pages[page].url)) void Image.prefetch(pages[page].url).catch(() => {}); });
  }, [vertical, spreadIndex, spreadList]);

  // --- Sauvegarde de la position et chapitre lu ---
  useEffect(() => {
    if (!pages.length || !settings) return;
    const timer = setTimeout(() => {
      const summary: Comic = comic || { id: comicId, provider, kind: 'manga', title: 'Lecture', altTitles: [], synopsis: '', genres: [], status: 'unknown', languages: [] };
      void databaseService.saveComicProgress({ comicId, provider, chapterId, chapterNumber: chapter?.number || '', language, page: position.page, pageCount: pages.length, offset: vertical ? position.offset : 0, comic: summary }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [position, pages.length, comic, chapter?.number, vertical, settings]);
  useEffect(() => {
    if (pages.length && lastSeen >= pages.length - 1) void databaseService.markComicChapterRead(comicId, chapterId).catch(() => {});
  }, [lastSeen, pages.length]);

  // --- Navigation ---
  const goToChapter = (item: ComicChapter | undefined, page: number) => {
    if (!item) { setNotice(page < 0 ? 'Premier chapitre disponible' : 'Dernier chapitre disponible'); setTimeout(() => setNotice(''), 1800); return; }
    navigation.replace('ComicReader', { provider, comicId, chapterId: item.id, language, page });
  };
  const turn = (delta: 1 | -1) => {
    interacted.current = true;
    const next = spreadIndex + delta;
    if (next < 0) return goToChapter(previousChapter, -1);
    if (next >= spreadList.length) return goToChapter(nextChapter, 0);
    setPosition({ page: spreadList[next][0], offset: 0 });
  };
  const update = (changes: Partial<ReaderSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...changes };
    setSettings(next);
    void saveReaderSettings(comic?.kind ?? 'manga', next);
    // Changement de mode : on garde la page en cours.
    if (changes.mode === 'vertical' || (vertical && changes.zoom !== undefined) || changes.readerWidth !== undefined) { target.current = position; interacted.current = false; }
  };
  const zoomBy = (step: number) => {
    if (!settings) return;
    const at = ZOOMS.findIndex(value => value >= settings.zoom - 0.01);
    update({ zoom: ZOOMS[Math.min(Math.max((at < 0 ? 0 : at) + step, 0), ZOOMS.length - 1)] });
  };
  const toggleFullscreen = () => {
    if (!web) { setChrome(value => !value); return; }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  // Clavier et molette (PC). Les gestionnaires lisent l'état courant via une référence.
  const handlers = useRef({ key: (_event: KeyboardEvent) => {}, wheel: (_event: WheelEvent) => {} });
  handlers.current.key = event => {
    if (!settings || sheet || (event.target as HTMLElement | null)?.tagName === 'INPUT' || event.ctrlKey || event.metaKey || event.altKey) return;
    const paged = !vertical;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => paged ? (arrowAction('ArrowLeft', settings.direction) === 'next' ? turn(1) : turn(-1)) : goToChapter(previousChapter, 0),
      ArrowRight: () => paged ? (arrowAction('ArrowRight', settings.direction) === 'next' ? turn(1) : turn(-1)) : goToChapter(nextChapter, 0),
      PageDown: () => paged ? turn(1) : list.current?.scrollToOffset({ offset: scrollY.current + box.height * 0.9 }),
      PageUp: () => paged ? turn(-1) : list.current?.scrollToOffset({ offset: Math.max(scrollY.current - box.height * 0.9, 0) }),
      ' ': () => paged ? turn(1) : list.current?.scrollToOffset({ offset: scrollY.current + box.height * 0.9 }),
      ArrowDown: () => { interacted.current = true; vertical ? list.current?.scrollToOffset({ offset: scrollY.current + 120 }) : turn(1); },
      ArrowUp: () => { interacted.current = true; vertical ? list.current?.scrollToOffset({ offset: Math.max(scrollY.current - 120, 0) }) : turn(-1); },
      n: () => goToChapter(nextChapter, 0), p: () => goToChapter(previousChapter, 0),
      '+': () => zoomBy(1), '=': () => zoomBy(1), '-': () => zoomBy(-1), '0': () => update({ zoom: 1 }),
      '[': () => update({ readerWidth: Math.max(settings.readerWidth - 100, 360) }), ']': () => update({ readerWidth: Math.min(settings.readerWidth + 100, 2400) }),
      f: toggleFullscreen, m: () => update({ mode: mode === 'single' ? 'double' : mode === 'double' ? 'vertical' : 'single' }),
      Escape: () => { if (!document.fullscreenElement) navigation.goBack(); },
    };
    const action = actions[event.key];
    if (action) { event.preventDefault(); interacted.current = true; action(); }
  };
  const lastWheel = useRef(0);
  handlers.current.wheel = event => {
    interacted.current = true;
    // En mode paginé sans défilement possible, la molette tourne les pages.
    if (vertical || !settings || settings.zoom > 1 || settings.fit === 'width' || sheet) return;
    if (Date.now() - lastWheel.current < 350 || Math.abs(event.deltaY) < 10) return;
    lastWheel.current = Date.now();
    turn(event.deltaY > 0 ? 1 : -1);
  };
  useEffect(() => {
    if (!web) return;
    const key = (event: KeyboardEvent) => handlers.current.key(event);
    const wheel = (event: WheelEvent) => handlers.current.wheel(event);
    document.addEventListener('keydown', key);
    document.addEventListener('wheel', wheel, { passive: true });
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('wheel', wheel); };
  }, []);

  // Gestes tactiles : balayage horizontal pour tourner (sens de lecture respecté), pincement pour zoomer.
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => !vertical && (settings?.zoom ?? 1) <= 1 && Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) < 50) return;
      const forward = settings?.direction === 'rtl' ? gesture.dx > 0 : gesture.dx < 0;
      turn(forward ? 1 : -1);
    },
  }), [vertical, settings, spreadIndex, spreadList, previousChapter, nextChapter]);
  const pinchScale = useRef(1);
  const pinch = usePinchGesture({
    runOnJS: true,
    onUpdate: (event: any) => { pinchScale.current = event.scale ?? 1; },
    onDeactivate: () => {
      if (settings && Math.abs(pinchScale.current - 1) > 0.08) update({ zoom: Math.min(Math.max(Math.round(settings.zoom * pinchScale.current * 4) / 4, 1), 4) });
      pinchScale.current = 1;
    },
  });
  // Zones d'appui reprises de Mihon ; en vertical, « suivant » fait défiler d'un écran.
  const onPageTap = (event: GestureResponderEvent) => {
    if (!settings || !box.width || !box.height) return;
    const action = navigationAction(settings.tapZones, event.nativeEvent.pageX / box.width, event.nativeEvent.pageY / box.height, !vertical && settings.direction === 'rtl');
    if (action === 'menu') { setChrome(value => !value); return; }
    interacted.current = true;
    if (!vertical) { turn(action === 'next' ? 1 : -1); return; }
    const step = box.height * 0.75 * (action === 'next' ? 1 : -1);
    list.current?.scrollToOffset({ offset: Math.max(scrollY.current + step, 0) });
  };
  const openLanguages = () => {
    if (!comic || !source.getLanguageInfo) return;
    const codes = sortLanguages([...comic.languages, language], language);
    setLanguages(Object.fromEntries(codes.map(code => [code, 'loading'])));
    for (const code of codes) getLanguageInfoCached(provider, comicId, code)
      .then(info => setLanguages(previous => previous && { ...previous, [code]: info }))
      .catch(() => setLanguages(previous => previous && { ...previous, [code]: 'error' }));
  };
  const switchLanguage = async (code: string) => {
    const current = chapter ?? { id: chapterId, number: '', title: '', language, pages: pages.length, available: true };
    const target = await pickEquivalentChapter(provider, comicId, current, code);
    if (!target) return;
    setSheet(false);
    void saveComicLanguage(code, comicId);
    navigation.replace('ComicReader', { provider, comicId, chapterId: target.id, language: code, page: 0 });
  };
  const reloadPages = useCallback(() => {
    // Les adresses MangaDex@Home expirent : on redemande le serveur puis on remonte les pages.
    void source.getPages(chapterId).then(loaded => { if (loaded.length) { setPages(loaded); setGeneration(value => value + 1); } }).catch(() => {});
  }, [chapterId, provider]);

  // --- Rendu ---
  const title = chapter ? chapterLabel(chapter) : comic?.title || 'Chapitre';
  const icon = (name: React.ComponentProps<typeof Ionicons>['name'], label: string, onPress: () => void, disabled = false) =>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.icon, disabled && { opacity: 0.3 }]}><Ionicons name={name} size={22} color="white" /></TouchableOpacity>;
  const credit = [chapter?.group && `Traduction : ${chapter.group}`, source.credit].filter(Boolean).join('\n');

  let body: React.ReactNode = null;
  if (loading || !settings || !box.width) body = <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.muted}>Chargement du chapitre…</Text></View>;
  else if (error) body = <View style={styles.center}>
    <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
    <Text style={[styles.muted, { textAlign: 'center', fontSize: 15 }]}>{error}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={[styles.pill, { backgroundColor: colors.buttonBg }]}><Text style={styles.pillText}>Réessayer</Text></TouchableOpacity>
    {nextChapter && <TouchableOpacity accessibilityRole="button" onPress={() => goToChapter(nextChapter, 0)} style={styles.pill}><Text style={styles.pillText}>Passer au {chapterLabel(nextChapter).toLowerCase()}</Text></TouchableOpacity>}
  </View>;
  else if (vertical) body = <ScrollView horizontal scrollEnabled={columnWidth > box.width} contentContainerStyle={{ minWidth: box.width }}>
    <FlatList ref={list} data={pages} keyExtractor={(_item, position) => `${generation}-${position}`}
      style={{ width: Math.max(columnWidth, box.width), height: box.height }}
      contentContainerStyle={{ alignItems: 'center', paddingTop: topPadding }}
      getItemLayout={(_data, position) => ({ length: offsets[position + 1] - offsets[position], offset: offsets[position] + topPadding, index: position })}
      renderItem={({ item, index: position }) => <Pressable onPress={onPageTap}><PageImage page={item} index={position} width={columnWidth} height={aspects[position] * columnWidth} onAspect={onAspect} onRetry={reloadPages} /></Pressable>}
      // Mémoire : seules quelques pages autour de l'écran restent montées.
      initialNumToRender={3} maxToRenderPerBatch={2} windowSize={5} removeClippedSubviews={Platform.OS === 'android'}
      onScroll={onScroll} scrollEventThrottle={64} onScrollBeginDrag={() => { interacted.current = true; }}
      ListFooterComponent={<View style={styles.footer}>
        <Text style={styles.muted}>Fin : {title}</Text>
        {nextChapter ? <TouchableOpacity accessibilityRole="button" onPress={() => goToChapter(nextChapter, 0)} style={[styles.pill, { backgroundColor: colors.buttonBg }]}><Text style={styles.pillText}>{chapterLabel(nextChapter)} →</Text></TouchableOpacity> : <Text style={styles.muted}>Dernier chapitre disponible.</Text>}
        <Text style={styles.credit}>{credit}</Text>
      </View>} />
  </ScrollView>;
  else {
    const order = displayOrder(currentSpread, settings.direction);
    const sizes = fitSpread(order.map(page => aspects[page]), { width: box.width, height: box.height }, settings.fit, settings.zoom);
    body = <View style={{ flex: 1 }} {...swipe.panHandlers}>
      <ScrollView key={`v-${spreadIndex}`} contentContainerStyle={{ minHeight: box.height, justifyContent: 'center' }}>
        <ScrollView horizontal key={`h-${spreadIndex}`} contentContainerStyle={{ minWidth: box.width, justifyContent: 'center', alignItems: 'center' }}>
          {/* Tout l'écran reçoit les appuis, bandes autour de la page comprises. */}
          <Pressable onPress={onPageTap} style={{ flexDirection: 'row', minWidth: box.width, minHeight: box.height, justifyContent: 'center', alignItems: 'center' }}>
            {order.map((page, position) => <PageImage key={`${generation}-${page}`} page={pages[page]} index={page} width={sizes[position].width} height={sizes[position].height} onAspect={onAspect} onRetry={reloadPages} />)}
          </Pressable>
        </ScrollView>
      </ScrollView>
    </View>;
  }

  const pageInfo = pages.length ? (vertical ? `${position.page + 1}/${pages.length}` : `${currentSpread.map(page => page + 1).join('-')}/${pages.length}`) : '';
  const option = (label: string, active: boolean, onPress: () => void) => <TouchableOpacity key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.option, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}><Text style={{ color: 'white', fontSize: 13 }}>{label}</Text></TouchableOpacity>;

  return <GestureDetector gesture={pinch}><View style={styles.root} onLayout={event => setBox({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
    <StatusBar hidden={!chrome} style="light" />
    {body}
    {chrome && <View style={[styles.bar, { paddingTop: insets.top }]}>
      {icon('chevron-back', 'Retour', () => navigation.goBack())}
      <View style={{ flex: 1, marginHorizontal: 4 }}>
        <Text numberOfLines={1} style={styles.title}>{comic?.title || 'Lecture'}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{notice || [title, pageInfo].filter(Boolean).join(' · ')}</Text>
      </View>
      {icon('play-skip-back', 'Chapitre précédent', () => goToChapter(previousChapter, 0), !previousChapter)}
      {icon('play-skip-forward', 'Chapitre suivant', () => goToChapter(nextChapter, 0), !nextChapter)}
      {icon('remove', 'Dézoomer', () => zoomBy(-1), !settings || settings.zoom <= 1)}
      {icon('add', 'Zoomer', () => zoomBy(1), !settings || settings.zoom >= 4)}
      {web && icon('scan-outline', 'Plein écran', toggleFullscreen)}
      {icon('options-outline', 'Réglages de lecture', () => setSheet(true), !settings)}
    </View>}
    {!vertical && chrome && pages.length > 0 && <View style={[styles.pager, { paddingBottom: 8 + insets.bottom }]}>
      {icon(settings?.direction === 'rtl' ? 'chevron-forward' : 'chevron-back', 'Page précédente', () => turn(-1))}
      <Text style={styles.subtitle}>{settings?.direction === 'rtl' ? 'Sens de lecture : droite → gauche' : 'Sens de lecture : gauche → droite'}</Text>
      {icon(settings?.direction === 'rtl' ? 'chevron-back' : 'chevron-forward', 'Page suivante', () => turn(1))}
    </View>}
    <CustomModal visible={sheet} onRequestClose={() => setSheet(false)} alignment="bottom">{settings && <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ padding: 18, paddingBottom: 18 + insets.bottom, gap: 10 }}>
      <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Réglages de lecture</Text>{icon('close', 'Fermer', () => setSheet(false))}</View>
      <Text style={styles.label}>Mode</Text>
      <View style={styles.row}>{option('Page simple', mode === 'single', () => update({ mode: 'single' }))}{option('Double page', mode === 'double', () => update({ mode: 'double' }))}{option('Défilement vertical', mode === 'vertical', () => update({ mode: 'vertical' }))}</View>
      {!vertical && <><Text style={styles.label}>Sens de lecture</Text>
        <View style={styles.row}>{option('Droite → gauche (manga)', settings.direction === 'rtl', () => update({ direction: 'rtl' }))}{option('Gauche → droite', settings.direction === 'ltr', () => update({ direction: 'ltr' }))}</View>
        <Text style={styles.label}>Ajustement</Text>
        <View style={styles.row}>{option('Hauteur (page entière)', settings.fit === 'height', () => update({ fit: 'height' }))}{option('Largeur', settings.fit === 'width', () => update({ fit: 'width' }))}</View></>}
      <Text style={styles.label}>Zoom : {Math.round(settings.zoom * 100)} %</Text>
      <View style={styles.row}>{option('−', false, () => zoomBy(-1))}{option('100 %', settings.zoom === 1, () => update({ zoom: 1 }))}{option('+', false, () => zoomBy(1))}</View>
      {vertical && box.width >= 760 && <><Text style={styles.label}>Largeur de lecture : {settings.readerWidth} px</Text>
        <View style={styles.row}>{option('−100', false, () => update({ readerWidth: Math.max(settings.readerWidth - 100, 360) }))}{option('Par défaut', settings.readerWidth === READER_DEFAULTS[comic?.kind ?? 'manga'].readerWidth, () => update({ readerWidth: READER_DEFAULTS[comic?.kind ?? 'manga'].readerWidth }))}{option('+100', false, () => update({ readerWidth: Math.min(settings.readerWidth + 100, 2400) }))}</View></>}
      <Text style={styles.label}>Zones d’appui</Text>
      <View style={styles.row}>{(Object.keys(NAVIGATION_LABELS) as NavigationLayout[]).map(layout => option(NAVIGATION_LABELS[layout], settings.tapZones === layout, () => update({ tapZones: layout })))}</View>
      {!!source.getLanguageInfo && <><Text style={styles.label}>Langue des chapitres : {languageName(language)}</Text>
        <Text style={styles.hint}>Source : {source.name}{chapter?.group ? ` · traduction : ${chapter.group}` : ''}. Changer de langue propose le chapitre équivalent, ouvert à la première page.</Text>
        {languages ? <View style={styles.row}>{Object.entries(languages).map(([code, info]) => {
          if (typeof info === 'object' && info.count === 0) return null;
          const ready = typeof info === 'object';
          const detail = info === 'loading' ? '…' : info === 'error' ? '?' : info.last?.number ? `jusqu’au ch. ${info.last.number}` : 'lisible';
          return <TouchableOpacity key={code} accessibilityRole="button" accessibilityState={{ selected: code === language, disabled: !ready }} disabled={!ready || code === language} onPress={() => void switchLanguage(code)} style={[styles.option, code === language && { backgroundColor: colors.primary, borderColor: colors.primary }, !ready && { opacity: 0.5 }]}><Text style={{ color: 'white', fontSize: 13 }}>{languageName(code)} ({detail})</Text></TouchableOpacity>;
        })}</View> : option('Changer de langue…', false, openLanguages)}</>}
      <Text style={styles.hint}>{web ? 'Clavier : ← → pages (ou chapitres en vertical), Espace/Page↓ suivante, N/P chapitre, + − 0 zoom, [ ] largeur, M mode, F plein écran, Échap retour. Molette : pages en mode paginé.' : 'Touchez les zones d’appui pour tourner les pages, le reste pour afficher les commandes. Balayez pour tourner, pincez pour zoomer.'}</Text>
      <Text style={styles.credit}>{credit}</Text>
    </ScrollView>}</CustomModal>
  </View></GestureDetector>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4, backgroundColor: 'rgba(15,16,22,0.92)' },
  pager: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 4, backgroundColor: 'rgba(15,16,22,0.92)' },
  icon: { padding: 10 },
  title: { color: 'white', fontSize: 15, fontWeight: '700' }, subtitle: { color: colors.textSecondary, fontSize: 12 },
  missing: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: colors.textSecondary, fontSize: 13 },
  loader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  pill: { borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.surfaceElevated },
  pillText: { color: 'white', fontWeight: '600' },
  footer: { alignItems: 'center', gap: 14, paddingVertical: 40, paddingHorizontal: 20, maxWidth: 600 },
  credit: { color: colors.textTertiary, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  label: { color: 'white', fontSize: 15, fontWeight: '600', marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 9 },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },
});
