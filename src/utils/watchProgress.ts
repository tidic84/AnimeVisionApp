import { Episode } from '../types/anime';

// Seuil unique : badge « vu », enregistrement « vu », reprise au début, épisode suivant et synchro MAL.
export const WATCHED_PROGRESS = 90;

export const isFinished = (progress?: number) => (progress ?? 0) >= WATCHED_PROGRESS;

export const episodeLanguage = (episode: Episode) => episode.langue?.toUpperCase() || [...new Set((episode.streaming_servers || []).map(server => server.langue?.toUpperCase()).filter(Boolean))].join(' / ');
