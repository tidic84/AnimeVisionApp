/** Intervalle renvoyé par l'API (/api/episode/:id/skip-times, source AniSkip). */
export type SkipResult = { type: string; start: number; end: number; episode_length: number };
export type SkipKind = 'intro' | 'recap' | 'outro';
export type SkipInterval = { kind: SkipKind; start: number; end: number };

const KINDS: Record<string, SkipKind> = { op: 'intro', 'mixed-op': 'intro', recap: 'recap', ed: 'outro', 'mixed-ed': 'outro' };
// Au-delà, ce n'est plus le même montage (double épisode, version longue) : les temps n'ont plus de sens.
const MAX_RELATIVE_GAP = 0.25;
// Fin d'ending saisie à la main (arrondie, souvent 10 à 15 s trop tôt) : ce qui reste n'est que la fin
// du générique et la carte de fin, on va jusqu'au bout (le lecteur enchaîne alors sur l'épisode suivant).
const OUTRO_TAIL = 20;

/**
 * Un intervalle par type, pris dans la mesure AniSkip dont la durée est la plus proche de la vidéo lue.
 * Les hébergeurs n'ont pas tous la même durée (logo ajouté, générique coupé) : un petit écart est ignoré ;
 * au-delà, l'opening reste calé sur le début et un ending qui allait jusqu'au bout est recalé sur la fin.
 * Les saisies AniSkip elles-mêmes sont parfois fausses (ex. Tanaka-kun : opening décalé de 20 à 40 s sur
 * certains épisodes, quelle que soit la durée mesurée) : l'écart de durée ne permet pas de les repérer.
 */
export function pickSkips(results: SkipResult[], duration: number): SkipInterval[] {
  if (!(duration > 0)) return [];
  const gapOf = (result: SkipResult) => (result.episode_length > 0 ? duration - result.episode_length : null);
  const best = new Map<SkipKind, SkipResult>();
  for (const result of results) {
    const kind = KINDS[result.type];
    const gap = gapOf(result);
    if (!kind || result.end - result.start < 5 || (gap !== null && Math.abs(gap) > duration * MAX_RELATIVE_GAP)) continue;
    const current = best.get(kind);
    if (!current || Math.abs(gap ?? Infinity) < Math.abs(gapOf(current) ?? Infinity)) best.set(kind, result);
  }
  const intervals: SkipInterval[] = [];
  for (const [kind, result] of best) {
    const gap = gapOf(result);
    let { start, end } = result;
    if (gap !== null && Math.abs(gap) > Math.max(5, duration * 0.03) && kind === 'outro' && result.episode_length - end <= 3) {
      start += gap;
      end = duration;
    }
    if (kind === 'outro' && end < duration && duration - end <= OUTRO_TAIL) end = duration;
    end = Math.min(end, duration);
    if (start < 0 || end - start < 5) continue;
    // Un opening en fin d'épisode ou un ending au début : saisie erronée ou autre montage.
    if (kind === 'intro' && start > duration / 2) continue;
    if (kind === 'outro' && end < duration / 2) continue;
    intervals.push({ kind, start, end });
  }
  return intervals;
}
