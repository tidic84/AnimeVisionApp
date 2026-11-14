import { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Platform } from 'react-native';
import * as Brightness from 'expo-brightness';
import { VolumeManager } from 'react-native-volume-manager';
import type { VideoPlayer } from 'expo-video';
import { BOOST_RATE, Edges, GestureSide, isTap, isVerticalSwipe, levelAfterDrag, LONG_PRESS, swipeSide } from '../../utils/playerGestures';

type Options = {
  player: VideoPlayer;
  /** Vitesse choisie dans les réglages, rétablie à la fin de l'appui long. */
  speed: number;
  focused: boolean;
  edges: Edges;
  onTap: (x: number, width: number) => void;
  onSwipeStart?: () => void;
};
type Touch = { x: number; pageX: number; pageY: number; side: GestureSide | null; mode: 'pending' | 'swipe' | 'boost' | 'none'; start: number | null };

const readLevel = (side: GestureSide) => side === 'brightness' ? Brightness.getBrightnessAsync() : VolumeManager.getVolume().then(result => result.volume);

// Gestes sur la vidéo : tap (délégué), glissement vertical luminosité / volume, appui long en x2.
// La luminosité est celle de la fenêtre de l'app (pas le réglage système) et revient à la normale en quittant le lecteur.
export default function usePlayerGestures({ player, speed, focused, edges, onTap, onSwipeStart }: Options) {
  const [level, setLevel] = useState<{ side: GestureSide; value: number } | null>(null);
  const [boosting, setBoosting] = useState(false);
  const size = useRef({ width: 1, height: 1 });
  const touch = useRef<Touch | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applied = useRef<Record<GestureSide, number | null>>({ brightness: null, volume: null });
  // Luminosité choisie par geste (réappliquée au retour sur le lecteur) et luminosité d'origine (iOS : seule la luminosité système existe).
  const chosenBrightness = useRef<number | null>(null);
  const originalBrightness = useRef<number | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const clearPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
  const restoreBrightness = () => {
    if (chosenBrightness.current === null) return;
    if (Platform.OS === 'android') void Brightness.restoreSystemBrightnessAsync().catch(() => {});
    else if (originalBrightness.current !== null) void Brightness.setBrightnessAsync(originalBrightness.current).catch(() => {});
  };
  const apply = (side: GestureSide, value: number) => {
    setLevel({ side, value });
    const last = applied.current[side];
    if (last !== null && Math.abs(last - value) < 0.005) return;
    applied.current[side] = value;
    if (side === 'brightness') { chosenBrightness.current = value; void Brightness.setBrightnessAsync(value).catch(() => {}); }
    // Le module tronque value × nombre de crans : la petite marge évite de rester un cran en dessous (0,6 × 15 = 8,999…).
    else void VolumeManager.setVolume(Math.min(1, value + 0.001)).catch(() => {});
  };
  const stopBoost = () => { try { player.playbackRate = speedRef.current; } catch {} setBoosting(false); };
  const end = (commit: boolean) => {
    clearPress();
    const current = touch.current;
    touch.current = null;
    if (!current) return;
    if (current.mode === 'boost') stopBoost();
    if (current.mode === 'swipe') { if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setLevel(null), 600); }
    if (current.mode === 'pending' && commit) onTap(current.x, size.current.width);
  };

  useEffect(() => {
    if (!focused) return;
    if (chosenBrightness.current !== null) void Brightness.setBrightnessAsync(chosenBrightness.current).catch(() => {});
    return restoreBrightness;
  }, [focused]);
  useEffect(() => () => { clearPress(); if (hideTimer.current) clearTimeout(hideTimer.current); if (touch.current?.mode === 'boost') stopBoost(); touch.current = null; }, []);

  const handlers = {
    onLayout: (event: LayoutChangeEvent) => { const { width, height } = event.nativeEvent.layout; size.current = { width, height }; },
    onStartShouldSetResponder: () => true,
    // Pendant un réglage ou un x2, aucune autre vue ne récupère le doigt.
    onResponderTerminationRequest: () => touch.current?.mode !== 'swipe' && touch.current?.mode !== 'boost',
    onResponderGrant: (event: GestureResponderEvent) => {
      const { locationX, locationY, pageX, pageY } = event.nativeEvent;
      const side = swipeSide(locationX, locationY, size.current.width, size.current.height, edges);
      const state: Touch = { x: locationX, pageX, pageY, side, mode: 'pending', start: null };
      touch.current = state;
      // Valeur de départ lue dès l'appui, pour être prête quand le glissement est reconnu.
      if (side) void readLevel(side).then(value => {
        if (side === 'brightness' && originalBrightness.current === null) originalBrightness.current = value;
        if (touch.current === state && state.start === null) state.start = value;
      }).catch(() => {});
      clearPress();
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        if (touch.current !== state || state.mode !== 'pending') return;
        // Vidéo en pause : l'appui long ne fait rien (et ne compte pas comme un tap).
        if (!player.playing) { state.mode = 'none'; return; }
        state.mode = 'boost';
        try { player.playbackRate = BOOST_RATE; } catch {}
        setBoosting(true);
      }, LONG_PRESS);
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const state = touch.current;
      if (!state) return;
      const dx = event.nativeEvent.pageX - state.pageX;
      const dy = event.nativeEvent.pageY - state.pageY;
      if (state.mode === 'pending') {
        if (state.side && isVerticalSwipe(dx, dy)) {
          clearPress(); state.mode = 'swipe';
          if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
          onSwipeStart?.();
        } else if (!isTap(dx, dy)) { clearPress(); state.mode = 'none'; }
      }
      if (state.mode === 'swipe' && state.side && state.start !== null) apply(state.side, levelAfterDrag(state.start, dy, size.current.height));
    },
    onResponderRelease: () => end(true),
    onResponderTerminate: () => end(false),
  };
  return { handlers, level, boosting };
}
