import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoPlayer } from 'expo-video';

const TICK = 500;
const WARMUP = 10000;
const AFTER_SEEK = 3000;
const WINDOW = 60000;
const MIN_STALL = 1000;
const MAX_STALLS = 3;
const MAX_BLOCKED = 5000;

// Détecte les coupures répétées de la lecture native (progression figée alors que la lecture est en cours ou en chargement).
// `key` identifie l'épisode et le lecteur : la suggestion n'est faite qu'une fois par couple.
export default function useStutterDetector(player: VideoPlayer, key: string, enabled: boolean) {
  const [stuttering, setStuttering] = useState(false);
  const shown = useRef(new Set<string>());
  const state = useRef({ lastTime: 0, lastProgress: 0, ignoreUntil: Infinity, stallStart: null as number | null, stalls: [] as { at: number; duration: number }[] });
  const markSeek = useCallback(() => {
    const value = state.current;
    value.stallStart = null;
    value.ignoreUntil = Math.max(value.ignoreUntil === Infinity ? 0 : value.ignoreUntil, Date.now() + AFTER_SEEK);
  }, []);
  const dismiss = useCallback(() => { shown.current.add(key); setStuttering(false); }, [key]);
  useEffect(() => {
    setStuttering(false);
    state.current = { lastTime: 0, lastProgress: 0, ignoreUntil: Infinity, stallStart: null, stalls: [] };
    if (!enabled || shown.current.has(key)) return;
    const timer = setInterval(() => {
      const value = state.current;
      const now = Date.now();
      let time = 0;
      let status = 'idle';
      let playing = false;
      try { time = player.currentTime; status = player.status; playing = player.playing; } catch { return; }
      if (Math.abs(time - value.lastTime) > 0.05) {
        // Les 10 premières secondes comptent à partir du premier mouvement de la vidéo.
        if (value.ignoreUntil === Infinity) value.ignoreUntil = now + WARMUP;
        // Un saut de position (reprise, seek) est traité comme un seek.
        if (Math.abs(time - value.lastTime) > 3) markSeek();
        if (value.stallStart !== null && now - value.stallStart > MIN_STALL && now > value.ignoreUntil) value.stalls.push({ at: now, duration: now - value.stallStart });
        value.stallStart = null; value.lastTime = time; value.lastProgress = now;
      } else if (status === 'error' || (!playing && status !== 'loading')) value.stallStart = null;
      else if (value.stallStart === null && now - value.lastProgress < 1500 && now > value.ignoreUntil) value.stallStart = value.lastProgress;
      value.stalls = value.stalls.filter(stall => now - stall.at < WINDOW);
      const ongoing = value.stallStart !== null && now > value.ignoreUntil ? now - value.stallStart : 0;
      const blocked = value.stalls.reduce((sum, stall) => sum + stall.duration, ongoing);
      if (value.stalls.length >= MAX_STALLS || blocked > MAX_BLOCKED) { shown.current.add(key); setStuttering(true); clearInterval(timer); }
    }, TICK);
    return () => clearInterval(timer);
  }, [player, key, enabled, markSeek]);
  return { stuttering, markSeek, dismiss };
}
