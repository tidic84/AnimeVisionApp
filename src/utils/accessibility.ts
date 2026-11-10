import { DownloadStatus, Episode } from '../types/anime';
import { isFinished } from './watchProgress';

/**
 * Étendue tactile ajoutée autour d'un bouton à icône pour atteindre la cible
 * recommandée (~44 px) sans changer sa taille affichée.
 */
export const hitSlopFor = (width: number, height = width, target = 44) => {
  const horizontal = Math.max(0, Math.ceil((target - width) / 2));
  const vertical = Math.max(0, Math.ceil((target - height) / 2));
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
};

const DOWNLOAD_STATES: Partial<Record<DownloadStatus, string>> = {
  [DownloadStatus.DOWNLOADED]: 'téléchargé',
  [DownloadStatus.DOWNLOADING]: 'téléchargement en cours',
  [DownloadStatus.QUEUED]: 'en attente de téléchargement',
};

/** État lu par le lecteur d'écran : « vu », « en cours, 40 % », puis le téléchargement. */
export function episodeState(episode: Pick<Episode, 'isWatched' | 'watchProgress' | 'downloadStatus'>, progress = episode.watchProgress): string {
  const watched = episode.isWatched || isFinished(progress);
  const parts = [watched ? 'vu' : progress > 0 ? `en cours, ${Math.round(Math.min(100, progress))} %` : ''];
  parts.push(DOWNLOAD_STATES[episode.downloadStatus] ?? '');
  return parts.filter(Boolean).join(', ');
}

/** « One Piece, saison 2, épisode 5, en cours, 40 % ». L'animé est omis quand l'écran le nomme déjà. */
export function episodeLabel(episode: Episode, { withAnime = true, progress }: { withAnime?: boolean; progress?: number } = {}): string {
  const season = Number(episode.num_saison);
  const title = episode.title && !/^(e|é)pisode\s*\d+$/i.test(episode.title.trim()) ? episode.title.trim() : '';
  return [
    withAnime ? episode.animeTitle : '',
    season > 0 && season < 100 ? `saison ${season}` : '',
    `épisode ${episode.number}`,
    title,
    episodeState(episode, progress ?? episode.watchProgress ?? 0),
  ].filter(Boolean).join(', ');
}
