/** Intervalle renvoyé par l'API (/api/episode/:id/skip-times, source AniSkip). */
export type SkipResult = { type: string; start: number; end: number; episode_length: number };
export type SkipKind = 'intro' | 'recap' | 'outro';
export type SkipInterval = { kind: SkipKind; start: number; end: number };

const KINDS: Record<string, SkipKind> = { op: 'intro', 'mixed-op': 'intro', recap: 'recap', ed: 'outro', 'mixed-ed': 'outro' };
// Au-delà, la vidéo de l'hébergeur n'est pas le même montage que celle mesurée par AniSkip : les temps seraient faux.
const MAX_LENGTH_GAP = 20;

/** Un intervalle par type, celui mesuré sur la durée la plus proche de la vidéo lue. */
export function pickSkips(results: SkipResult[], duration: number): SkipInterval[] {
  if (!(duration > 0)) return [];
  const best = new Map<SkipKind, SkipResult>();
  for (const result of results) {
    const kind = KINDS[result.type];
    const gap = Math.abs(result.episode_length - duration);
    if (!kind || gap > MAX_LENGTH_GAP || result.end - result.start < 5 || result.end > duration + 1) continue;
    // Un opening en fin d'épisode ou un ending au début : saisie erronée.
    if (kind === 'intro' && result.start > duration / 2) continue;
    if (kind === 'outro' && result.end < duration / 2) continue;
    const current = best.get(kind);
    if (!current || gap < Math.abs(current.episode_length - duration)) best.set(kind, result);
  }
  return [...best].map(([kind, result]) => ({ kind, start: result.start, end: Math.min(result.end, duration) }));
}
