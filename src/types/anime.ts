export interface Anime {
  id: string;
  title: string;
  originalTitle?: string;
  synopsis: string;
  genres: string[];
  studio: string;
  year: number;
  rating: number;
  status: AnimeStatus;
  thumbnail: string;
  banner?: string;
  episodeCount: number;
  duration: number; // en minutes
  malId?: number;
  titre_alt?: string;
  titre_jap?: string;
  url_anime_sama?: string;
  kitsu_id?: string;
  anidb_id?: string;
  date_ajout?: string;
  date_update?: string;
}

export interface Season {
  id: string;
  anime_id: string;
  num_saison: number;
  titre_saison: string;
  annee_sortie?: number;
  nb_episodes: number;
  statut: string;
  type: string;
  date_ajout?: string;
  date_update?: string;
}

export interface StreamingServer {
  name: string;
  url: string;
  quality: string;
  langue: string;
}

export interface Episode {
  id: string;
  animeId: string;
  animeTitle?: string; // Titre de l'anime pour l'affichage et les logs
  number: number;
  title: string;
  thumbnail: string;
  duration: number; // en secondes
  watchProgress: number; // pourcentage (0-100)
  isWatched: boolean;
  downloadStatus: DownloadStatus;
  videoUrl?: string;
  streamingUrls: {
    quality: VideoQuality;
    url: string;
  }[];
  skipIntro?: {
    start: number;
    end: number;
  };
  skipOutro?: {
    start: number;
    end: number;
  };
  saison_id?: string;
  titre_episode?: string;
  description?: string;
  streaming_servers?: StreamingServer[];
  kitsu_episode_id?: string;
  anidb_episode_id?: string;
  langue?: string;
  date_sortie?: string;
  date_ajout?: string;
  num_saison?: string;
  titre_saison?: string;
  anime_poster?: string;
}

export interface AnimeList {
  id: string;
  name: string;
  isDefault: boolean;
  animeIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchHistory {
  animeId: string;
  episodeId: string;
  lastWatchedAt: Date;
  progress: number;
}

export enum AnimeStatus {
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  UPCOMING = 'upcoming',
  PAUSED = 'paused'
}

export enum VideoQuality {
  LOW = '480p',
  MEDIUM = '720p',
  HIGH = '1080p',
  ULTRA = '1440p'
}

export enum DownloadStatus {
  NOT_DOWNLOADED = 'not_downloaded',
  QUEUED = 'queued',
  DOWNLOADING = 'downloading',
  DOWNLOADED = 'downloaded',
  FAILED = 'failed'
}

export enum WatchStatus {
  NOT_STARTED = 'not_started',
  WATCHING = 'watching',
  COMPLETED = 'completed',
  ON_HOLD = 'on_hold',
  DROPPED = 'dropped'
}

export interface UserAnimeStatus {
  animeId: string;
  status: WatchStatus;
  currentEpisode: number;
  score?: number;
  startDate?: Date;
  finishDate?: Date;
  notes?: string;
}

export interface ApiResponse<T> {
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  meta: {
    cache_hit: boolean;
    response_time: string;
    timestamp: string;
    [key: string]: any;
  };
}

export interface ApiError {
  error: true;
  message: string;
  status: number;
  timestamp: string;
} 