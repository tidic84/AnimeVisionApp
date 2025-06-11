import { API_ADDRESS } from '@env';

interface ExtractedVideoUrl {
  url: string;
  quality?: string;
  type: 'hls' | 'mp4' | 'webm';
  extractedAt: number;
  source: 'proxy' | 'api';
}

interface ExtractionResult {
  success: boolean;
  urls: ExtractedVideoUrl[];
  method: 'client' | 'server';
  duration: number;
  error?: string;
}

class VideoUrlExtractor {
  private readonly PROXY_SERVICES = [
    'https://api.allorigins.win/raw?url=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://cors-anywhere.herokuapp.com/',
  ];

  private readonly VIDEO_PATTERNS = [
    // URLs vidéo directes
    /(https?:\/\/[^"'\s]+\.(?:mp4|m3u8|webm|mkv|avi)(?:\?[^"'\s]*)?)/gi,
    // URLs dans des attributs src
    /src=["']([^"']*\.(?:mp4|m3u8|webm)[^"']*)["']/gi,
    // URLs dans du JavaScript
    /["']([^"']*\/[^"']*\.(?:mp4|m3u8|webm)[^"']*)["']/gi,
    // URLs de streaming
    /(https?:\/\/[^"'\s]*(?:stream|video|play|embed)[^"'\s]*\.(?:mp4|m3u8|webm)(?:\?[^"'\s]*)?)/gi,
    // URLs dans les données JSON
    /"(?:url|src|file|video)":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi
  ];

  private readonly CONFIG_PATTERNS = [
    /file\s*:\s*["']([^"']+)["']/gi,
    /source\s*:\s*["']([^"']+)["']/gi,
    /mp4\s*:\s*["']([^"']+)["']/gi,
    /hls\s*:\s*["']([^"']+)["']/gi,
    /playlist\s*:\s*["']([^"']+)["']/gi
  ];

  /**
   * Stratégie hybride : essaye serveur puis client en fallback
   */
  async extractVideoUrls(videoPageUrl: string): Promise<ExtractionResult> {
    console.log('[VideoExtractor] Début extraction pour:', videoPageUrl);
    
    // 1. Essayer côté serveur d'abord (si API disponible)
    try {
      const serverResult = await this.extractViaServer(videoPageUrl);
      if (serverResult.success && serverResult.urls.length > 0) {
        console.log('[VideoExtractor] ✅ Extraction serveur réussie');
        return serverResult;
      }
    } catch (error) {
      console.log('[VideoExtractor] ⚠️ Serveur indisponible, fallback client');
    }

    // 2. Fallback côté client
    console.log('[VideoExtractor] 🔄 Fallback extraction client...');
    return await this.extractViaClient(videoPageUrl);
  }

  /**
   * Extraction côté serveur (rapide, avec cache)
   */
  private async extractViaServer(videoPageUrl: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    try {
      // Utiliser la variable d'environnement du fichier .env
      const apiAddress = API_ADDRESS || 'http://localhost:8001';
      
      // Appel à l'API
      const response = await fetch(`${apiAddress}/extract-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: videoPageUrl }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        urls: data.urls || [],
        method: 'server',
        duration: Date.now() - startTime,
      };

    } catch (error) {
      return {
        success: false,
        urls: [],
        method: 'server',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extraction côté client (robuste, fallback)
   */
  private async extractViaClient(videoPageUrl: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    const foundUrls = new Set<string>();

    try {
      // Tester chaque proxy
      for (const proxy of this.PROXY_SERVICES) {
        try {
          console.log(`[VideoExtractor] Test proxy: ${proxy}`);
          
          const proxyUrl = `${proxy}${encodeURIComponent(videoPageUrl)}`;
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });

          if (response.ok) {
            const html = await response.text();
            console.log(`[VideoExtractor] ✅ Proxy OK: ${html.length} chars`);
            
            if (html.length > 10000) {
              const urls = this.extractUrlsFromHtml(html);
              urls.forEach(url => foundUrls.add(url));
              
              if (foundUrls.size > 0) {
                console.log(`[VideoExtractor] 🎬 ${foundUrls.size} URLs trouvées`);
                break; // Premier proxy qui fonctionne suffit
              }
            }
          }
        } catch (proxyError) {
          console.log(`[VideoExtractor] ❌ Proxy failed: ${proxy}`);
          continue; // Essayer le proxy suivant
        }
      }

      // Convertir en format standardisé
      const extractedUrls: ExtractedVideoUrl[] = Array.from(foundUrls).map(url => ({
        url,
        type: this.detectVideoType(url),
        extractedAt: Date.now(),
        source: 'proxy' as const,
      }));

      return {
        success: extractedUrls.length > 0,
        urls: extractedUrls,
        method: 'client',
        duration: Date.now() - startTime,
      };

    } catch (error) {
      return {
        success: false,
        urls: [],
        method: 'client',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extraction des URLs depuis le HTML
   */
  private extractUrlsFromHtml(html: string): string[] {
    const foundUrls = new Set<string>();

    // Patterns principaux
    this.VIDEO_PATTERNS.forEach(pattern => {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(html)) !== null) {
        const url = match[1] || match[0];
        if (url && url.length > 10 && this.isValidVideoUrl(url)) {
          foundUrls.add(url);
        }
      }
    });

    // Scripts avec configurations
    const scriptRegex = /<script[^>]*>(.*?)<\/script>/gis;
    let scriptMatch;
    let scriptCount = 0;

    while ((scriptMatch = scriptRegex.exec(html)) !== null && scriptCount < 5) {
      const script = scriptMatch[1];
      scriptCount++;

      this.CONFIG_PATTERNS.forEach(pattern => {
        let configMatch;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((configMatch = regex.exec(script)) !== null) {
          const url = configMatch[1];
          if (url && this.isValidVideoUrl(url)) {
            foundUrls.add(url);
          }
        }
      });
    }

    return Array.from(foundUrls);
  }

  /**
   * Validation URL vidéo
   */
  private isValidVideoUrl(url: string): boolean {
    return (
      url.includes('.mp4') ||
      url.includes('.m3u8') ||
      url.includes('.webm') ||
      url.includes('stream') ||
      url.includes('video')
    ) && (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('//')
    );
  }

  /**
   * Détection du type de vidéo
   */
  private detectVideoType(url: string): 'hls' | 'mp4' | 'webm' {
    if (url.includes('.m3u8')) return 'hls';
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('.webm')) return 'webm';
    return 'hls'; // Par défaut
  }

  /**
   * Cache simple pour éviter les re-extractions
   */
  private static cache = new Map<string, { result: ExtractionResult; timestamp: number }>();
  private static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async extractVideoUrlsWithCache(videoPageUrl: string): Promise<ExtractionResult> {
    // Vérifier le cache
    const cached = VideoUrlExtractor.cache.get(videoPageUrl);
    if (cached && Date.now() - cached.timestamp < VideoUrlExtractor.CACHE_DURATION) {
      console.log('[VideoExtractor] 📋 Cache hit');
      return { ...cached.result, duration: 0 }; // Instantané depuis cache
    }

    // Extraction
    const result = await this.extractVideoUrls(videoPageUrl);
    
    // Mettre en cache si succès
    if (result.success) {
      VideoUrlExtractor.cache.set(videoPageUrl, {
        result,
        timestamp: Date.now(),
      });
    }

    return result;
  }
}

export default VideoUrlExtractor;
export type { ExtractedVideoUrl, ExtractionResult }; 