import * as FileSystem from 'expo-file-system';
import { Episode, DownloadStatus, VideoQuality } from '../types/anime';
import videoUrlExtractor from './VideoUrlExtractor';

export interface DownloadProgress {
  downloadId: string;
  totalSegments: number;
  completedSegments: number;
  totalBytes: number;
  status: 'downloading' | 'completed' | 'error';
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

interface HLSSegment {
  url: string;
  duration: number;
  index: number;
}

// Classe optimisée pour le téléchargement HLS
export class DownloadServiceOptimized {
  private activeDownloads = new Map<string, boolean>();
  private readonly CONCURRENT_DOWNLOADS = 6; // Téléchargements simultanés
  private readonly MAX_RETRIES = 5; // Augmenté de 3 à 5 retries
  private readonly CHUNK_SIZE = 5; // Réduire pour éviter la surcharge serveur
  private readonly MAX_FILE_SIZE_MB = 700; // Augmenté de 300MB à 700MB pour les épisodes plus lourds
  private readonly SEGMENT_TIMEOUT_MS = 60000; // Augmenté de 45s à 60s timeout
  private readonly ESTIMATED_SEGMENT_SIZE_MB = 4; // ~4MB par segment en moyenne

  private generateDownloadId(episode: Episode): string {
    // Générer un ID unique basé sur le timestamp et l'ID de l'épisode
    return `${episode.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  async downloadHLS(
    episode: Episode,
    hlsUrl: string,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<string> {
    const downloadId = this.generateDownloadId(episode);
    console.log(`[DownloadOpt] 🚀 Début téléchargement HLS: ${episode.title}`);
    console.log(`[DownloadOpt] 🔗 URL: ${hlsUrl}`);

    try {
      // Parser la playlist M3U8
      const segments = await this.parseHLSPlaylist(hlsUrl);
      console.log(`[DownloadOpt] 📋 ${segments.length} segments trouvés`);

      // Valider la taille avant de commencer
      await this.validateSegments(segments);
      
      // Télécharger et assembler les segments
      return await this.downloadAndAssembleStreaming(
        episode,
        segments,
        downloadId,
        onProgress
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DownloadOpt] ❌ Erreur: ${errorMessage}`);
      throw error;
    }
  }

  private async parseHLSPlaylist(hlsUrl: string): Promise<HLSSegment[]> {
    const response = await fetch(hlsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://vidmoly.to/'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const m3u8Content = await response.text();
    
    // Vérifier si c'est une master playlist
    if (m3u8Content.includes('#EXT-X-STREAM-INF')) {
      console.log(`[DownloadOpt] 📺 Master playlist détectée`);
      const streamUrl = await this.resolveMasterPlaylist(hlsUrl, m3u8Content);
      
      // Récupérer la playlist de la meilleure qualité
      const streamResponse = await fetch(streamUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Referer': 'https://vidmoly.to/'
        }
      });

      if (!streamResponse.ok) {
        throw new Error(`HTTP ${streamResponse.status} sur playlist qualité`);
      }

      const streamContent = await streamResponse.text();
      console.log(`[DownloadOpt] ✅ Playlist qualité récupérée: ${streamUrl}`);
      
      // Parser les segments de la playlist de qualité
      const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/'));
      return this.parseM3U8Segments(streamContent, baseUrl);
    }
    
    // Si ce n'est pas une master playlist, parser directement les segments
    const baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/'));
    return this.parseM3U8Segments(m3u8Content, baseUrl);
  }

  private async resolveMasterPlaylist(masterUrl: string, content: string): Promise<string> {
    const lines = content.split('\n');
    const streams: { bandwidth: number; resolution: string; url: string }[] = [];
    let currentBandwidth = 0;
    let currentResolution = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        // Parser la bande passante
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        if (bandwidthMatch) {
          currentBandwidth = parseInt(bandwidthMatch[1], 10);
        }
        
        // Parser la résolution
        const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        if (resolutionMatch) {
          currentResolution = resolutionMatch[1];
        }
        
        // Récupérer l'URL dans la ligne suivante
        const urlLine = lines[i + 1]?.trim();
        if (urlLine && !urlLine.startsWith('#')) {
          const streamUrl = urlLine.startsWith('http') 
            ? urlLine 
            : `${masterUrl.substring(0, masterUrl.lastIndexOf('/'))}/${urlLine}`;
          
          streams.push({
            bandwidth: currentBandwidth,
            resolution: currentResolution,
            url: streamUrl
          });
        }
      }
    }

    if (streams.length === 0) {
      // Si pas de streams trouvés, essayer de parser l'URL avec ,l,n,
      const urlMatch = masterUrl.match(/_([\w,]+)\.urlset/);
      if (urlMatch && urlMatch[1]) {
        const qualities = urlMatch[1].split(',').filter(q => q);
        console.log(`[DownloadOpt] 📊 Qualités disponibles:`, qualities);
        
        // Choisir la meilleure qualité (n > l)
        const bestQuality = qualities.includes('n') ? 'n' : 'l';
        const streamUrl = masterUrl.replace('master.m3u8', `index-${bestQuality}1-a1.m3u8`);
        
        console.log(`[DownloadOpt] ✅ Meilleure qualité: ${bestQuality}`);
        return streamUrl;
      }
      
      throw new Error('Aucun stream trouvé dans la master playlist');
    }

    // Trier par bande passante et choisir le meilleur
    streams.sort((a, b) => b.bandwidth - a.bandwidth);
    const bestStream = streams[0];
    
    console.log(`[DownloadOpt] ✅ Meilleur stream: ${bestStream.resolution} (${Math.round(bestStream.bandwidth/1000)}kbps)`);
    return bestStream.url;
  }

  private parseM3U8Segments(content: string, baseUrl: string): HLSSegment[] {
    const segments: HLSSegment[] = [];
    const lines = content.split('\n');
    let duration = 0;
    let index = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:([0-9.]+)/);
        duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
      } else if (line && !line.startsWith('#')) {
        const segmentUrl = line.startsWith('http') ? line : `${baseUrl}/${line}`;
        segments.push({
          url: segmentUrl,
          duration,
          index: index++
        });
      }
    }

    return segments;
  }

  private async validateSegments(segments: HLSSegment[]): Promise<void> {
    const estimatedTotalMB = Math.round((segments.length * this.ESTIMATED_SEGMENT_SIZE_MB));
    console.log(`[DownloadOpt] 📊 Taille estimée: ${estimatedTotalMB}MB (${segments.length} segments)`);
    
    if (estimatedTotalMB > this.MAX_FILE_SIZE_MB) {
      throw new Error(
        `Episode trop volumineux (≈${estimatedTotalMB}MB). ` +
        `Limite: ${this.MAX_FILE_SIZE_MB}MB. ` +
        `${segments.length} segments de ~${this.ESTIMATED_SEGMENT_SIZE_MB}MB chacun.`
      );
    }
  }

  private async downloadBatchParallel(batch: HLSSegment[]): Promise<(string | null)[]> {
    const downloadPromises = batch.map(async (segment) => {
      let retries = 0;
      while (retries < this.MAX_RETRIES) {
        try {
          console.log(`[DownloadOpt] 📥 Segment ${segment.index}: tentative ${retries + 1}/${this.MAX_RETRIES}`);
          
          const response = await FileSystem.downloadAsync(
            segment.url,
            FileSystem.cacheDirectory + `segment_${segment.index}.ts`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Sec-Fetch-Mode': 'cors'
              }
            }
          );

          if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}`);
          }

          // Lire le fichier en base64
          const data = await FileSystem.readAsStringAsync(response.uri, {
            encoding: FileSystem.EncodingType.Base64
          });

          // Nettoyer le fichier temporaire
          await FileSystem.deleteAsync(response.uri, { idempotent: true });

          return data;

        } catch (error) {
          retries++;
          console.warn(`[DownloadOpt] ⚠️ Segment ${segment.index}, erreur ${retries}/${this.MAX_RETRIES}:`, error);
          
          if (retries === this.MAX_RETRIES) {
            console.error(`[DownloadOpt] ❌ Segment ${segment.index}: échec après ${this.MAX_RETRIES} tentatives`);
            return null;
          }
          
          // Attendre avant de réessayer
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
      return null;
    });

    return Promise.all(downloadPromises);
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private async validateFileSize(totalBytes: number): Promise<void> {
    const totalSizeMB = Math.round(totalBytes / (1024 * 1024));
    console.log(`[DownloadOpt] 📊 Taille totale estimée: ${totalSizeMB} MB`);
    
    if (totalBytes > this.MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new Error(`Fichier trop volumineux (≈${totalSizeMB}MB). Limite: ${this.MAX_FILE_SIZE_MB}MB.`);
    }
  }

  private async downloadAndAssembleStreaming(
    episode: Episode,
    segments: HLSSegment[],
    downloadId: string,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<string> {
    // Valider la taille avant de commencer
    await this.validateSegments(segments);

    const downloadDir = `${FileSystem.documentDirectory}downloads`;
    const tempDir = `${FileSystem.documentDirectory}temp_${downloadId}`;
    const finalPath = `${downloadDir}/${episode.title.replace(/[^a-zA-Z0-9]/g, '_')}.ts`;
    
    // Créer les répertoires nécessaires
    await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
    await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

    console.log(`[DownloadOpt] 🔗 Assemblage streaming de ${segments.length} segments`);

    let totalBytes = 0;
    let completedSegments = 0;
    const batches = this.createBatches(segments, this.CHUNK_SIZE);
    const segmentFiles: string[] = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`[DownloadOpt] 📥 Téléchargement batch ${i + 1}/${batches.length} (${batch.length} segments)`);
        
        // Télécharger chaque segment directement dans un fichier avec retry
        const batchPromises = batch.map(async (segment, j) => {
          const segmentPath = `${tempDir}/segment_${i}_${j}.ts`;
          const maxRetries = 5; // Augmenter les tentatives
          
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              // Utiliser downloadAsync pour télécharger directement dans un fichier
              // Ajouter un timeout pour éviter les blocages
              const downloadPromise = FileSystem.downloadAsync(
                segment.url,
                segmentPath,
                {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                    'Referer': 'https://vidmoly.to/'
                  }
                }
              );
              
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Timeout')), 30000); // 30s timeout
              });
              
              const downloadResult = await Promise.race([downloadPromise, timeoutPromise]);
              
              if (downloadResult.status === 200) {
                // Vérifier la taille du fichier téléchargé
                const fileInfo = await FileSystem.getInfoAsync(segmentPath);
                if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
                  totalBytes += fileInfo.size;
                  return segmentPath;
                }
              }
              
              // Si statut non-200 ou fichier vide, retry
              if (attempt < maxRetries - 1) {
                console.warn(`[DownloadOpt] ⚠️ Segment ${segment.index} échec (statut: ${downloadResult.status}), retry ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Délai progressif
                continue;
              }
              
              console.warn(`[DownloadOpt] ❌ Segment ${segment.index} définitivement échué après ${maxRetries} tentatives (statut: ${downloadResult.status})`);
              return null;
              
            } catch (error) {
              if (attempt < maxRetries - 1) {
                console.warn(`[DownloadOpt] ⚠️ Erreur segment ${segment.index}, retry ${attempt + 1}/${maxRetries}:`, error);
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Délai progressif
                continue;
              }
              
              console.warn(`[DownloadOpt] ❌ Segment ${segment.index} définitivement échué après ${maxRetries} tentatives:`, error);
              return null;
            }
          }
          
          return null;
        });
        
        // Attendre tous les téléchargements du batch
        const batchResults = await Promise.all(batchPromises);
        
        // Filtrer les segments valides et les ajouter à la liste
        const validSegments = batchResults.filter(path => path !== null) as string[];
        segmentFiles.push(...validSegments);
        completedSegments += validSegments.length;
        
        // Si aucun segment n'a réussi dans ce batch, augmenter le délai
        if (validSegments.length === 0 && batch.length > 0) {
          console.warn(`[DownloadOpt] ⚠️ Batch ${i + 1} complètement échoué, pause de récupération...`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3s de pause
        }
        
        // Mettre à jour la progression
        const progressPercent = Math.round((completedSegments / segments.length) * 100);
        onProgress({
          downloadId,
          totalSegments: segments.length,
          completedSegments,
          totalBytes,
          status: 'downloading'
        });
        
        console.log(`[DownloadOpt] ✅ Batch ${i + 1}/${batches.length} terminé: ${validSegments.length}/${batch.length} segments (Total: ${completedSegments}/${segments.length} - ${progressPercent}%)`);
        
        // Pause entre les batches pour éviter la surcharge serveur
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms de pause
        }
      }

      // Vérifier qu'on a suffisamment de segments (accepter 85% minimum)
      const successRate = completedSegments / segments.length;
      if (successRate < 0.85) {
        throw new Error(
          `Téléchargement trop incomplet: ${completedSegments}/${segments.length} segments (${Math.round(successRate * 100)}%)`
        );
      }
      
      if (successRate < 0.95) {
        console.warn(`[DownloadOpt] ⚠️ Téléchargement partiel accepté: ${completedSegments}/${segments.length} segments (${Math.round(successRate * 100)}%)`);
      }

      console.log(`[DownloadOpt] 🔗 Assemblage de ${segmentFiles.length} fichiers segments...`);
      
      // Assembler les segments en utilisant la concaténation binaire
      await this.concatenateFiles(segmentFiles, finalPath);

      console.log(`[DownloadOpt] ✅ Assemblage terminé: ${completedSegments} segments, ${totalBytes} bytes`);

      // Valider le fichier final
      await this.validateDownload(finalPath, segments.length);

      // Notification finale de progression
      onProgress({
        downloadId,
        totalSegments: segments.length,
        completedSegments,
        totalBytes,
        status: 'completed'
      });

      console.log(`[DownloadOpt] 🎉 Téléchargement terminé avec succès: ${finalPath}`);

      return finalPath;
    } finally {
      // Nettoyage des fichiers temporaires
      try {
        await FileSystem.deleteAsync(tempDir, { idempotent: true });
      } catch (error) {
        console.warn('[DownloadOpt] ⚠️ Erreur lors du nettoyage des fichiers temporaires:', error);
      }
    }
  }

  /**
   * Concatène une liste de fichiers en un seul fichier de sortie
   * Nouvelle approche : création d'une playlist M3U8 locale
   */
  private async concatenateFiles(inputFiles: string[], outputFile: string): Promise<void> {
    console.log(`[DownloadOpt] 🎬 Création d'une playlist M3U8 pour ${inputFiles.length} segments...`);
    
    if (inputFiles.length === 0) {
      throw new Error('Aucun fichier à traiter');
    }
    
    try {
      // Approche alternative : créer une playlist M3U8 locale
      // qui pointe vers tous les segments téléchargés
      const playlistContent = await this.createLocalM3U8Playlist(inputFiles, outputFile);
      
      // Sauvegarder la playlist
      const playlistPath = outputFile.replace('.ts', '.m3u8');
      await FileSystem.writeAsStringAsync(playlistPath, playlistContent);
      
      console.log(`[DownloadOpt] ✅ Playlist M3U8 créée: ${playlistPath}`);
      console.log(`[DownloadOpt] ✅ Fichier principal créé: ${outputFile}`);
      
      // Calculer la taille totale des segments
      let totalSize = 0;
      for (const file of inputFiles) {
        const info = await FileSystem.getInfoAsync(file);
        if (info.exists && info.size) {
          totalSize += info.size;
        }
      }
      
      console.log(`[DownloadOpt] ✅ Assemblage terminé: ${inputFiles.length} segments, ${totalSize} bytes`);
      
    } catch (error) {
      console.error('[DownloadOpt] ❌ Erreur lors de la création de la playlist:', error);
      throw error;
    }
  }

  /**
   * Crée une playlist M3U8 locale qui pointe vers les segments téléchargés
   */
  private async createLocalM3U8Playlist(segments: string[], outputFile: string): Promise<string> {
    // Extraire le dossier de destination
    const outputDir = outputFile.substring(0, outputFile.lastIndexOf('/'));
    
    // Créer la playlist M3U8
    const playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:10',
      '#EXT-X-MEDIA-SEQUENCE:0'
    ];

    // Ajouter chaque segment en utilisant un chemin relatif
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      // Extraire juste le nom du fichier pour un chemin relatif
      const segmentName = segment.substring(segment.lastIndexOf('/') + 1);
      playlist.push('#EXTINF:10.0,');
      playlist.push(segmentName);
    }

    // Marquer la fin de la playlist
    playlist.push('#EXT-X-ENDLIST');

    // Copier tous les segments dans le dossier de destination
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentName = segment.substring(segment.lastIndexOf('/') + 1);
      const destPath = `${outputDir}/${segmentName}`;
      
      await FileSystem.copyAsync({
        from: segment,
        to: destPath
      });
    }

    return playlist.join('\n');
  }

  /**
   * Vérifie que le téléchargement est complet et valide
   */
  private async validateDownload(outputFile: string, expectedSegments: number): Promise<void> {
    console.log(`[DownloadOpt] 🔍 Validation du téléchargement...`);
    
    try {
      // Vérifier que la playlist M3U8 existe
      const m3u8Path = outputFile.replace('.ts', '.m3u8');
      const m3u8Info = await FileSystem.getInfoAsync(m3u8Path);
      
      if (!m3u8Info.exists) {
        throw new Error('Playlist M3U8 introuvable');
      }
      
      // Lire le contenu de la playlist
      const m3u8Content = await FileSystem.readAsStringAsync(m3u8Path);
      const segmentLines = m3u8Content.split('\n').filter(line => line.endsWith('.ts'));
      
      // Extraire le dossier de destination
      const outputDir = outputFile.substring(0, outputFile.lastIndexOf('/'));
      
      // Vérifier que tous les segments référencés existent
      let existingSegments = 0;
      let totalSize = 0;
      
      for (const line of segmentLines) {
        const segmentPath = line.trim();
        if (!segmentPath) continue;
        
        // Nettoyer le chemin du segment
        const cleanSegmentPath = segmentPath.replace(/^file:\/+/, '');
        const fullPath = `${outputDir}/${cleanSegmentPath}`;
        
        try {
          const segmentInfo = await FileSystem.getInfoAsync(fullPath);
          
          if (segmentInfo.exists) {
            existingSegments++;
            if (segmentInfo.size) {
              totalSize += segmentInfo.size;
            }
          } else {
            console.warn(`[DownloadOpt] ⚠️ Segment manquant: ${cleanSegmentPath}`);
          }
        } catch (error) {
          console.warn(`[DownloadOpt] ⚠️ Erreur vérification segment ${cleanSegmentPath}:`, error);
        }
      }
      
      console.log(`[DownloadOpt] 📊 Segments validés: ${existingSegments}/${expectedSegments} (${Math.round(totalSize / 1024 / 1024)}MB)`);
      
      // Vérifier qu'on a au moins 85% des segments (comme avant)
      const successRate = (existingSegments / expectedSegments) * 100;
      if (successRate < 85) {
        throw new Error(`Téléchargement incomplet: ${successRate.toFixed(1)}% des segments présents (${existingSegments}/${expectedSegments})`);
      }
      
      console.log(`[DownloadOpt] ✅ Validation réussie: ${successRate.toFixed(1)}% des segments présents`);
      
    } catch (error) {
      console.error('[DownloadOpt] ❌ Erreur de validation:', error);
      throw error;
    }
  }
}

export default new DownloadServiceOptimized();
