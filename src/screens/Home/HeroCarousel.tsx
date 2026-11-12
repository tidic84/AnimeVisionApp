import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { radii } from '../../theme/shape';
import { palette } from '../../theme/palette';
import useReducedMotion from '../../hooks/useReducedMotion';
import { MotionPressable } from '../../components/Motion';
import { Anime, Episode } from '../../types/anime';
import { layout, typography } from '../../theme/tokens';

const nativeDriver = Platform.OS !== 'web';
/** Time each slide stays on screen before the carousel advances. */
const SLIDE_MS = 7000;
/** Length of an automatic slide change: slow enough to show the parallax and zoom. */
const TRANSITION_MS = 1400;
/** The incoming artwork settles from this zoom while it slides in. */
const ENTER_ZOOM = 1.12;
/** Fraction of the swipe distance the artwork lags behind (parallax). */
const PARALLAX = 0.35;

type Props = {
  items: Anime[];
  width: number;
  height: number;
  gutter: number;
  colors: typeof palette.dark;
  isInWatchlist: (anime: Anime) => boolean;
  watchlistEnabled: boolean;
  onOpen: (id: string) => void;
  onToggleWatchlist: (anime: Anime) => void;
  /** Épisode en cours pour cette œuvre : l'action principale devient « Reprendre ». */
  resumeFor?: (anime: Anime) => Episode | undefined;
  onResume?: (episode: Episode) => void;
};

/**
 * Full-bleed hero carousel: swipe or auto-advance with a progress bar per slide,
 * parallax + zoom-out on the artwork and a cross-fade of the text block.
 * Auto-advance pauses while touched, when the screen loses focus and when reduced motion is on.
 */
export default function HeroCarousel({ items, width, height, gutter, colors, isInWatchlist, watchlistEnabled, onOpen, onToggleWatchlist, resumeFor, onResume }: Props) {
  const wide = width >= layout.wide;
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const list = useRef<FlatList<Anime>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const [slide, setSlide] = useState(0);
  const [touching, setTouching] = useState(false);
  const slideRef = useRef(0);
  const shownSlide = useRef(0);
  const count = items.length;
  // Télécharge toutes les images dès l'arrivée des données, pour qu'aucune n'apparaisse noire puis en fondu.
  useEffect(() => { for (const anime of items) { const uri = anime.banner || anime.thumbnail; if (uri) Image.prefetch(uri).catch(() => {}); } }, [items]);
  const offset = useRef(0);
  const transition = useRef<Animated.CompositeAnimation | null>(null);
  const stopTransition = () => { transition.current?.stop(); transition.current = null; };

  const goTo = useCallback((index: number, animated = true) => {
    if (!count) return;
    const next = ((index % count) + count) % count;
    slideRef.current = next;
    setSlide(next);
    stopTransition();
    if (!animated || reduced) { list.current?.scrollToOffset({ offset: next * width, animated: false }); return; }
    // scrollToOffset({ animated: true }) is a fixed, very short native animation: drive the offset ourselves instead.
    const driver = new Animated.Value(offset.current);
    const id = driver.addListener(({ value }) => list.current?.scrollToOffset({ offset: value, animated: false }));
    transition.current = Animated.timing(driver, { toValue: next * width, duration: TRANSITION_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
    transition.current.start(() => driver.removeListener(id));
  }, [count, width, reduced]);

  // Keep the visible slide valid when the list shrinks or the screen rotates.
  useEffect(() => { if (slideRef.current >= count && count) goTo(0, false); }, [count, goTo]);
  useEffect(() => { list.current?.scrollToOffset({ offset: slideRef.current * width, animated: false }); }, [width]);

  const running = focused && !touching && !reduced && count > 1;
  useEffect(() => {
    if (shownSlide.current !== slide) { shownSlide.current = slide; progress.setValue(0); }
    if (!running) return;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    // Resume from where a pause left the bar instead of restarting the slide.
    progress.stopAnimation(value => {
      if (cancelled) return;
      animation = Animated.timing(progress, { toValue: 1, duration: Math.max(0, SLIDE_MS * (1 - value)), easing: Easing.linear, useNativeDriver: nativeDriver });
      animation.start(({ finished }) => { if (finished && !cancelled) goTo(slideRef.current + 1); });
    });
    return () => { cancelled = true; animation?.stop(); };
  }, [slide, running, progress, goTo]);

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    slideRef.current = index;
    setSlide(index);
    setTouching(false);
  };

  const renderItem = ({ item: anime, index }: { item: Anime; index: number }) => {
    const range = [(index - 1) * width, index * width, (index + 1) * width];
    const imageStyle = reduced ? undefined : {
      transform: [
        { translateX: scrollX.interpolate({ inputRange: range, outputRange: [-width * PARALLAX, 0, width * PARALLAX], extrapolate: 'clamp' }) },
        { scale: scrollX.interpolate({ inputRange: range, outputRange: [ENTER_ZOOM, 1, ENTER_ZOOM], extrapolate: 'clamp' }) },
      ],
    };
    const contentStyle = reduced ? undefined : {
      opacity: scrollX.interpolate({ inputRange: [range[0], index * width - width * .4, range[1], index * width + width * .4, range[2]], outputRange: [0, 0, 1, 0, 0], extrapolate: 'clamp' }),
      transform: [{ translateX: scrollX.interpolate({ inputRange: range, outputRange: [width * .25, 0, -width * .25], extrapolate: 'clamp' }) }],
    };
    const saved = isInWatchlist(anime);
    const episode = resumeFor?.(anime);
    return <View style={{ width, height, overflow: 'hidden' }}>
      <Animated.Image source={{ uri: anime.banner || anime.thumbnail }} resizeMode="cover" fadeDuration={0} style={[StyleSheet.absoluteFill, imageStyle]} />
      {/* Grand écran : voile latéral pour que le texte reste lisible sur l'illustration. */}
      {wide && <LinearGradient pointerEvents="none" start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} colors={['rgba(8,8,12,.85)', 'rgba(8,8,12,.35)', 'rgba(8,8,12,0)']} locations={[0, .45, .75]} style={StyleSheet.absoluteFill} />}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,.18)', palette.dark.background]} locations={[0, .35, .79]} style={[styles.gradient, { paddingHorizontal: gutter, paddingBottom: wide ? 64 : 46 }]}>
        <Animated.View style={[styles.content, contentStyle]}>
          {anime.featuredLabel && <View style={[styles.badge, { backgroundColor: colors.buttonBg }]}><Ionicons name="play-circle" size={14} color={colors.buttonText} /><Text style={[styles.badgeText, { color: colors.buttonText }]}>{anime.featuredLabel}</Text></View>}
          <Text accessibilityRole="header" style={[styles.title, wide && { fontSize: 44, lineHeight: 50 }]} numberOfLines={2}>{anime.title}</Text>
          <Text style={styles.metadata}>{[anime.year > 1900 ? String(anime.year) : '', ...anime.genres.slice(0, 3)].filter(Boolean).join(' · ')}</Text>
          <Text style={[styles.description, wide && { maxWidth: 560 }]} numberOfLines={3}>{anime.synopsis.replace(/<[^>]*>/g, '').trim()}</Text>
          <View style={styles.actions}>
            {episode && onResume
              ? <MotionPressable onPress={() => onResume(episode)} accessibilityLabel={`Reprendre ${anime.title}`} style={[styles.button, { backgroundColor: colors.buttonBg }]}><Ionicons name="play" size={20} color={colors.buttonText} /><Text style={[styles.buttonText, { color: colors.buttonText }]}>Reprendre</Text></MotionPressable>
              : <MotionPressable onPress={() => onOpen(anime.id)} accessibilityLabel={`Découvrir ${anime.title}`} style={[styles.button, { backgroundColor: colors.buttonBg }]}><Ionicons name="play" size={20} color={colors.buttonText} /><Text style={[styles.buttonText, { color: colors.buttonText }]}>Découvrir</Text></MotionPressable>}
            {episode && onResume && <MotionPressable onPress={() => onOpen(anime.id)} accessibilityLabel={`Voir la fiche de ${anime.title}`} style={styles.glass}><Ionicons name="information-circle-outline" size={20} color="#FFF" /><Text style={styles.glassText}>Fiche</Text></MotionPressable>}
            <MotionPressable disabled={!watchlistEnabled} onPress={() => onToggleWatchlist(anime)} accessibilityState={{ selected: saved, disabled: !watchlistEnabled }} accessibilityLabel={`${saved ? 'Retirer' : 'Ajouter'} ${anime.title} ${saved ? 'de' : 'à'} la Watchlist`} style={styles.glass}><Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color="#FFF" />{wide && <Text style={styles.glassText}>{saved ? 'Dans ma liste' : 'Ma liste'}</Text>}</MotionPressable>
          </View>
        </Animated.View>
      </LinearGradient>
    </View>;
  };

  return <View onTouchStart={() => setTouching(true)} onTouchEnd={() => setTouching(false)} onTouchCancel={() => setTouching(false)}>
    <Animated.FlatList
      ref={list}
      horizontal
      pagingEnabled
      data={items}
      keyExtractor={a => a.id}
      // Garde toutes les diapos montées : l'image suivante est déjà décodée quand elle entre.
      initialNumToRender={count}
      windowSize={count * 2 + 1}
      removeClippedSubviews={false}
      showsHorizontalScrollIndicator={false}
      getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: nativeDriver, listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = event.nativeEvent.contentOffset.x; } })}
      scrollEventThrottle={16}
      onScrollBeginDrag={() => { stopTransition(); setTouching(true); }}
      onMomentumScrollEnd={onMomentumEnd}
      renderItem={renderItem}
    />
    {count > 1 && <View style={[styles.indicators, { left: gutter }]}>
      {items.map((anime, index) => {
        const active = index === slide;
        return <Pressable key={anime.id} hitSlop={{ top: 20, bottom: 20, left: 3, right: 3 }} onPress={() => goTo(index)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`Afficher ${anime.title}, ${index + 1} sur ${count}`} style={styles.track}>
          {active && <Animated.View style={[styles.fill, { backgroundColor: colors.primary, transform: [{ scaleX: reduced ? 1 : progress }] }]} />}
        </Pressable>;
      })}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  gradient: { flex: 1, justifyContent: 'flex-end' },
  content: { gap: 12, maxWidth: 700 },
  title: { ...typography.hero, color: '#FFF', textShadowColor: 'rgba(0,0,0,.6)', textShadowRadius: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingHorizontal: 10, height: 26, borderRadius: radii.pill },
  badgeText: { fontSize: 12, fontWeight: '700' },
  metadata: { color: '#C9CAD6', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  description: { color: '#E2E2EA', fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 17, height: 46, borderRadius: radii.pill },
  buttonText: { fontSize: 14, fontWeight: '700' },
  // Bouton secondaire « verre » : lisible sur toute illustration.
  glass: { flexDirection: 'row', gap: 8, height: 46, minWidth: 46, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' },
  glassText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  indicators: { position: 'absolute', left: 18, bottom: 18, flexDirection: 'row', gap: 6 },
  track: { width: 28, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.32)' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, transformOrigin: 'left' },
});
