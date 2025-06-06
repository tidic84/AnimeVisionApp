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
}

export interface Episode {
  id: string;
  animeId: string;
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