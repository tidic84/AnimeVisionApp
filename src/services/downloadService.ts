import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Episode, DownloadStatus, VideoQuality } from '../types/anime';
import { logger } from '../utils/logger';
import databaseService from './databaseService';
import videoUrlExtractor, { VideoUrlExtractor } from './VideoUrlExtractor';
import hlsDownloader, { HlsDownloader, HlsProgress } from './hlsDownloader';

/**
 * Un téléchargement HLS enregistre <titre>.ts comme filePath, mais le fichier
 * lisible est la playlist <titre>.m3u8 posée à côté (le lecteur fait la même
 * conversion). Les autres chemins désignent directement le fichier.
 */
export function playableFile(filePath: string): string {
  return filePath.replace(/.ts$/, '.m3u8');
}

export interface DownloadProgress {
  downloadId: string;
  episodeId: string;
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  timeRemaining: number; // seconds
  totalSegments?: number;
  completedSegments?: number;
  status?: 'downloading' | 'completed' | 'error';
}

export interface DownloadItem {
  episode: Episode;
  quality: VideoQuality;
  url: string;
  progress: DownloadProgress;
  status: DownloadStatus;
  filePath?: string;
  downloadedAt?: Date;
  fileSize?: number;
}

export class DownloadService {
  private downloads: Map<string, DownloadItem> = new Map();
  private downloadCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();
  private maxConcurrentDownloads = 1; // Limiter à 1 téléchargement concurrent
  private downloadQueue: string[] = [];
  private activeDownloads = 0;
  private isProcessingQueue = false;
  private isStorageLoaded = false;

  constructor(
    private hlsDownloader: HlsDownloader,
    private videoUrlExtractor: VideoUrlExtractor
  ) {
    this.loadDownloadsFromStorage();
  }

  private generateDownloadId(episode: Episode, quality: VideoQuality): string {
    // Utiliser une clé basée sur l'épisode et la qualité pour éviter les doublons
    return `download_${episode.id}_${quality}`;
  }

  private createProgressObject(episode: Episode, downloadId: string): DownloadProgress {
    return {
      downloadId,
      episodeId: episode.id,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      timeRemaining: 0
    };
  }

  /**
   * Démarre le téléchargement d'un épisode
   */
  async startDownload(
    episode: Episode,
    quality: VideoQuality = VideoQuality.HIGH,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (Platform.OS === 'web') throw new Error('Le téléchargement hors ligne est disponible dans l’application mobile.');
    // S'assurer que le storage est chargé
    if (!this.isStorageLoaded) {
      await this.loadDownloadsFromStorage();
    }

    // Nettoyer les téléchargements orphelins avant de continuer
    await this.cleanupOrphanedDownloads();

    // Vérifier si cet épisode est déjà présent dans la liste des téléchargements avec cette qualité
    const existingDownload = Array.from(this.downloads.values()).find(existing =>
      existing.episode.id === episode.id &&
      existing.quality === quality &&
      existing.status !== DownloadStatus.FAILED
    );

    if (existingDownload) {
      logger.debug(`[Download] ⏩ Épisode ${episode.id} déjà en téléchargement ou téléchargé (statut: ${existingDownload.status}). Ignoré.`);
      logger.debug(`[Download] 📊 Téléchargements actuels: ${this.downloads.size}`);
      Array.from(this.downloads.values()).forEach(dl => {
        logger.debug(`[Download] - ${dl.episode.id}: ${dl.status} (${dl.episode.title})`);
      });
      return; // Empêcher la création d'une entrée en double
    }

    logger.debug(`[Download] 🎬 Téléchargement épisode ${episode.id}: ${episode.title}`);

    try {
      const downloadId = this.generateDownloadId(episode, quality);
      // L'item part en attente ; la progression « downloading » affiche « En cours » tout de suite.
      const downloadItem: DownloadItem = {
        episode,
        quality,
        url: '',
        progress: { ...this.createProgressObject(episode, downloadId), status: 'downloading' },
        status: DownloadStatus.QUEUED
      };
      this.downloads.set(downloadId, downloadItem);
      this.downloadQueue.push(downloadId);
      if (onProgress) {
        this.downloadCallbacks.set(downloadId, onProgress);
      }
      await this.saveDownloadsToStorage();
      logger.debug(`[Download] 📋 Téléchargement ajouté à la file d'attente (position ${this.downloadQueue.length})`);
      onProgress?.(downloadItem.progress);

      await this.processQueue();
    } catch (error) {
      logger.error('[Download] ❌ Erreur:', error);
      throw error;
    }
  }

  /**
   * Formate la taille de fichier
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Traite la queue de téléchargements
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.activeDownloads >= this.maxConcurrentDownloads || this.downloadQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.downloadQueue.length > 0 && this.activeDownloads < this.maxConcurrentDownloads) {
        const downloadId = this.downloadQueue.shift();
        if (!downloadId) break;

        const downloadItem = this.downloads.get(downloadId);
        if (!downloadItem) continue;

        logger.debug(`[Download] 🎬 Démarrage téléchargement: ${downloadItem.episode.title} (${this.downloadQueue.length} en attente)`);

        // Lancer le téléchargement sans attendre sa fin
        this.executeDownload(downloadId).catch(error => {
          logger.error(`[Download] ❌ Erreur téléchargement ${downloadId}:`, error);
        });
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Exécute un téléchargement sorti de la file : extraction de l'URL HLS,
   * téléchargement des segments, puis enregistrement du fichier obtenu.
   */
  private async executeDownload(downloadId: string): Promise<void> {
    const downloadItem = this.downloads.get(downloadId);
    if (!downloadItem) {
      throw new Error(`Téléchargement ${downloadId} non trouvé`);
    }

    this.activeDownloads++;
    const { episode } = downloadItem;
    const onProgress = this.downloadCallbacks.get(downloadId);

    try {
      downloadItem.status = DownloadStatus.DOWNLOADING;
      downloadItem.url = '';
      downloadItem.progress = this.createProgressObject(episode, downloadId);
      await this.saveDownloadsToStorage();

      const extractionResult = await this.videoUrlExtractor.extractHLSForEpisode(episode.id);
      if (!extractionResult.success || extractionResult.urls.length === 0) {
        throw new Error(`Impossible d'extraire URL streaming: ${extractionResult.error || 'Aucune URL trouvée'}`);
      }

      // Seul le HLS est téléchargeable : un MP4 direct seul fait échouer le téléchargement.
      const hlsUrl = extractionResult.urls.find(url => url.type === 'hls')?.url;
      if (!hlsUrl) {
        throw new Error('Aucune URL HLS trouvée');
      }
      logger.debug(`[Download] 📡 URL HLS: ${hlsUrl}`);

      const filePath = await this.hlsDownloader.downloadHLS(episode, hlsUrl, (progress: HlsProgress) => {
        downloadItem.progress = {
          downloadId,
          episodeId: episode.id,
          progress: (progress.completedSegments / progress.totalSegments * 100) || 0,
          downloadedBytes: progress.totalBytes || 0,
          totalBytes: progress.totalBytes || 0,
          speed: 0,
          timeRemaining: 0,
          totalSegments: progress.totalSegments,
          completedSegments: progress.completedSegments,
          status: progress.status
        };
        onProgress?.(downloadItem.progress);
      });

      downloadItem.status = DownloadStatus.DOWNLOADED;
      downloadItem.downloadedAt = new Date();
      downloadItem.filePath = filePath;
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists && fileInfo.size) {
          downloadItem.fileSize = fileInfo.size;
        }
      } catch (error) {
        logger.warn('[Download] ⚠️ Impossible de lire la taille du fichier:', error);
      }
      downloadItem.progress = { ...downloadItem.progress, progress: 100, status: 'completed' };
      await this.saveDownloadsToStorage();
      await this.updateEpisodeDownloadStatus(episode.id, DownloadStatus.DOWNLOADED, filePath);
      logger.debug(`[Download] ✅ Téléchargement terminé: ${episode.title} (${filePath}${downloadItem.fileSize ? `, ${this.formatFileSize(downloadItem.fileSize)}` : ''})`);
      onProgress?.(downloadItem.progress);
    } catch (error) {
      logger.error('[Download] ❌ Erreur téléchargement:', error instanceof Error ? error.message : error);
      downloadItem.status = DownloadStatus.FAILED;
      downloadItem.progress.status = 'error';
      await this.saveDownloadsToStorage();
      await this.updateEpisodeDownloadStatus(episode.id, DownloadStatus.FAILED);
      throw error;
    } finally {
      this.downloadCallbacks.delete(downloadId);
      this.activeDownloads--;
      this.processQueue(); // Traiter le prochain téléchargement
    }
  }

  /**
   * Annule un téléchargement
   */
  async cancelDownload(episodeId: string, quality?: VideoQuality): Promise<void> {
    await this.removeDownload(episodeId, quality);
  }

  /** Delete the exact episode and quality. Existing callers may omit quality. */
  async deleteDownload(episodeId: string, quality?: VideoQuality): Promise<void> {
    await this.removeDownload(episodeId, quality);
  }

  private async removeDownload(episodeId: string, quality?: VideoQuality): Promise<void> {
    if (!this.isStorageLoaded) await this.loadDownloadsFromStorage();
    const match = Array.from(this.downloads.entries()).find(([, item]) =>
      item.episode.id === episodeId && (quality === undefined || item.quality === quality));
    if (!match) return;
    const [downloadId, item] = match;
    // The optimized HLS engine has no interruptible task handle. Removing its
    // metadata during transfer would leave it downloading and writing files.
    if (item.status === DownloadStatus.DOWNLOADING) {
      throw new Error('Un transfert actif ne peut pas être annulé. Attendez sa fin pour le supprimer.');
    }
    if (item.filePath) await FileSystem.deleteAsync(item.filePath, { idempotent: true });
    this.downloadQueue = this.downloadQueue.filter(id => id !== downloadId);
    this.downloads.delete(downloadId);
    this.downloadCallbacks.delete(downloadId);
    const remaining = Array.from(this.downloads.values()).filter(other => other.episode.id === episodeId);
    const downloaded = remaining.find(other => other.status === DownloadStatus.DOWNLOADED);
    const status = downloaded ? DownloadStatus.DOWNLOADED : remaining.find(other => other.status === DownloadStatus.DOWNLOADING)?.status
      ?? remaining.find(other => other.status === DownloadStatus.QUEUED)?.status
      ?? remaining[0]?.status ?? DownloadStatus.NOT_DOWNLOADED;
    await this.updateEpisodeDownloadStatus(episodeId, status, downloaded?.filePath);
    await this.saveDownloadsToStorage();
  }

  /**
   * Récupère tous les téléchargements
   */
  async getAllDownloads(): Promise<DownloadItem[]> {
    // S'assurer que le stockage est chargé
    if (!this.isStorageLoaded) {
      await this.loadDownloadsFromStorage();
    }

    // Dédupliquer par id d'épisode – garde la version la plus récente (downloadedAt ou date de création)
    const uniqueMap: Map<string, DownloadItem> = new Map();
    for (const [dId, item] of this.downloads.entries()) {
      // Clé unique prioritaire : id d'épisode, sinon id de téléchargement
      const uniqueKey = item.episode?.id ? this.generateDownloadId(item.episode, item.quality) : dId;
      const existing = uniqueMap.get(uniqueKey);
      if (!existing) {
        uniqueMap.set(uniqueKey, item);
      } else {
        // Conserver celui qui est terminé ou le plus récent
        const existingDate = existing.downloadedAt || new Date(0);
        const currentDate = item.downloadedAt || new Date();
        if (item.status === DownloadStatus.DOWNLOADED && existing.status !== DownloadStatus.DOWNLOADED) {
          uniqueMap.set(uniqueKey, item);
        } else if (currentDate > existingDate) {
          uniqueMap.set(uniqueKey, item);
        }
      }
    }

    const downloads = Array.from(uniqueMap.values());

    // Fallback : si la déduplication produit un tableau vide alors qu'il existe des téléchargements,
    // on renvoie la liste brute pour éviter un affichage vide.
    const finalList = downloads.length > 0 ? downloads : Array.from(this.downloads.values());

    logger.debug(`[Download] 📋 getAllDownloads retourne ${finalList.length} téléchargements (dédupliqués)`);
    finalList.forEach(download => {
      logger.debug(`[Download] - ${download.episode.title}: ${download.status}`);
    });
    return finalList;
  }

  /**
   * Récupère les téléchargements par statut
   */
  async getDownloadsByStatus(status: DownloadStatus): Promise<DownloadItem[]> {
    const allDownloads = await this.getAllDownloads();
    return allDownloads.filter(item => item.status === status);
  }

  /**
   * Récupère l'espace utilisé par les téléchargements
   */
  async getStorageInfo(): Promise<{
    totalSize: number;
    availableSize: number;
    usedSize: number;
    downloadCount: number;
  }> {
    if (Platform.OS === 'web') return { totalSize: 0, availableSize: 0, usedSize: 0, downloadCount: 0 };
    const downloadedItems = await this.getDownloadsByStatus(DownloadStatus.DOWNLOADED);
    const usedSize = downloadedItems.reduce((total, item) => total + (item.fileSize || 0), 0);

    const diskInfo = await FileSystem.getFreeDiskStorageAsync();

    return {
      totalSize: diskInfo + usedSize,
      availableSize: diskInfo,
      usedSize,
      downloadCount: downloadedItems.length
    };
  }

  /**
   * Met à jour le statut de téléchargement d'un épisode dans la base de données
   */
  private async updateEpisodeDownloadStatus(
    episodeId: string,
    status: DownloadStatus,
    filePath?: string
  ): Promise<void> {
    try {
      // Récupérer l'épisode existant et mettre à jour ses propriétés
      const downloadItem = Array.from(this.downloads.values()).find(item => item.episode.id === episodeId);
      if (downloadItem) {
        const updatedEpisode: Episode = {
          ...downloadItem.episode,
          downloadStatus: status,
          videoUrl: filePath
        };
        await databaseService.saveEpisode(updatedEpisode);
      }
    } catch (error) {
      logger.warn(`[Download] Erreur mise à jour statut épisode ${episodeId}:`, error);
    }
  }

  /**
   * Sauvegarde les téléchargements dans le stockage local
   */
  private async saveDownloadsToStorage(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      const data = Object.fromEntries(this.downloads);
      await FileSystem.writeAsStringAsync(
        `${FileSystem.documentDirectory}downloads.json`,
        JSON.stringify(data),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (error) {
      logger.error('[Download] ❌ Erreur sauvegarde téléchargements:', error);
    }
  }

  /**
   * Charge les téléchargements depuis le stockage local
   */
  private async loadDownloadsFromStorage(): Promise<void> {
    if (Platform.OS === 'web') { this.isStorageLoaded = true; return; }
    try {
      const data = await FileSystem.readAsStringAsync(
        `${FileSystem.documentDirectory}downloads.json`,
        { encoding: FileSystem.EncodingType.UTF8 }
      );
      const savedDownloads = JSON.parse(data);
      this.downloads = new Map(Object.entries(savedDownloads));
      logger.debug(`[Download] 📂 Chargé ${this.downloads.size} téléchargements depuis le stockage`);
      this.isStorageLoaded = true;
    } catch (error) {
      logger.debug('[Download] 📝 Pas de téléchargements sauvegardés');
      this.isStorageLoaded = true;
    }
  }

  /**
   * Oublie les téléchargements terminés dont le fichier a disparu du disque.
   */
  private async cleanupOrphanedDownloads(): Promise<void> {
    const downloadedItems = await this.getDownloadsByStatus(DownloadStatus.DOWNLOADED);

    for (const item of downloadedItems) {
      if (item.filePath) {
        const playable = playableFile(item.filePath);
        const exists = (await FileSystem.getInfoAsync(playable)).exists
          || (playable !== item.filePath && (await FileSystem.getInfoAsync(item.filePath)).exists);
        if (!exists) {
          // Fichier supprimé, mettre à jour le statut
          await this.updateEpisodeDownloadStatus(item.episode.id, DownloadStatus.NOT_DOWNLOADED);
          this.downloads.delete(this.generateDownloadId(item.episode, item.quality));
        }
      }
    }

    await this.saveDownloadsToStorage();
  }
}

// Export singleton instance
export default new DownloadService(hlsDownloader, videoUrlExtractor);
