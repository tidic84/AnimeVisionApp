import { API_ADDRESS } from '@env';

interface ExtractedVideoUrl {
  url: string;
  quality?: string;
  type: 'hls' | 'mp4' | 'webm';
  extractedAt: number;
  source: 'client' | 'server';
}

interface ExtractionResult {
  success: boolean;
  urls: ExtractedVideoUrl[];
  embedUrl?: string;
  error?: string;
  extractionTime?: number;
}

// Extracteur HLS côté client pour contourner les restrictions IP
export class VideoUrlExtractor {
  private readonly PROXY_SERVICES = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere.herokuapp.com/',
    'https://api.allorigins.win/raw?url=',
  ];

     private readonly HLS_PATTERNS = [
     // Patterns de base pour m3u8
     /https?:\/\/[^"'\s>]+\.m3u8[^"'\s>]*/gi,
     /"(https?:\/\/[^"]*\.m3u8[^"]*)"/gi,
     /'(https?:\/\/[^']*\.m3u8[^']*)'/gi,

     // Patterns pour players vidéo
     /source[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
     /file[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
     /src[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,

     // Patterns pour jwplayer
     /jwplayer.*?file[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
     /\.setup.*?file[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,

     // Patterns pour configurations JavaScript
     /video_url[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
     /stream_url[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
     /hls[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,

     // Patterns pour data/variables
     /data-src[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
     /var\s+\w+\s*=\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi
   ];

  /**
   * Point d'entrée principal : récupère embed de l'API puis extrait HLS côté client
   */
  async extractHLSForEpisode(episodeId: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    console.log(`[HLS Extractor] 🎬 Début extraction pour épisode ${episodeId}`);

    try {
      // 1. Récupérer les URLs embed de l'API
      const embedUrls = await this.getEmbedUrlsFromAPI(episodeId);
      if (embedUrls.length === 0) {
        return {
          success: false,
          urls: [],
          error: 'Aucune URL embed trouvée dans l\'API. Cet épisode pourrait ne pas être disponible ou les serveurs de streaming sont hors ligne.'
        };
      }

             console.log(`[HLS Extractor] 📡 ${embedUrls.length} URLs embed récupérées`);

       // Filtrer seulement les embeds (pas les MP4 directs)
       const embedsOnly = embedUrls.filter(url =>
         url.includes('embed') ||
         url.includes('vidmoly') ||
         url.includes('sibnet') ||
         url.includes('sendvid')
       );

       if (embedsOnly.length === 0) {
         return {
           success: false,
           urls: [],
           error: `Aucun serveur de streaming compatible trouvé. URLs disponibles: ${embedUrls.join(', ')}`,
           extractionTime: Date.now() - startTime
         };
       }

       console.log(`[HLS Extractor] 🎯 ${embedsOnly.length} embeds à traiter`);

       // Essayer d'extraire HLS de chaque embed
       const failedEmbeds: string[] = [];
       for (const embedUrl of embedsOnly) {
         console.log(`[HLS Extractor] 🔍 Extraction HLS depuis: ${embedUrl}`);

         const result = await this.extractHLSFromEmbed(embedUrl);
         if (result.success && result.urls.length > 0) {
           const extractionTime = Date.now() - startTime;
           console.log(`[HLS Extractor] ✅ HLS extrait en ${extractionTime}ms`);

           return {
             ...result,
             embedUrl,
             extractionTime
           };
         } else {
           failedEmbeds.push(embedUrl);
         }
       }

             // Si aucune extraction client n'a fonctionné, essayer l'API backend
       console.log(`[HLS Extractor] ⚠️ Extraction client échouée, tentative fallback API backend`);
       const backendResult = await this.fallbackToBackendExtraction(episodeId, startTime);

       if (!backendResult.success) {
         return {
           success: false,
           urls: [],
           error: `Échec d'extraction sur tous les serveurs. Serveurs testés: ${failedEmbeds.length}. ${backendResult.error || 'API backend indisponible.'}`,
           extractionTime: Date.now() - startTime
         };
       }

       return backendResult;

    } catch (error: any) {
      console.error('[HLS Extractor] ❌ Erreur:', error.message);

      // Ultime fallback vers l'API backend
      try {
        return await this.fallbackToBackendExtraction(episodeId, startTime);
      } catch (fallbackError: any) {
        return {
          success: false,
          urls: [],
          error: `Erreur critique: ${error.message}. Impossible de contacter l'API backend: ${fallbackError.message}`,
          extractionTime: Date.now() - startTime
        };
      }
    }
  }

  /**
   * Récupère les URLs embed depuis l'API
   */
  private async getEmbedUrlsFromAPI(episodeId: string): Promise<string[]> {
    try {
      const baseUrl = (API_ADDRESS || 'http://localhost:3000').replace(/\/+$/, '');

      // Utiliser la nouvelle API pour récupérer l'épisode avec ses streaming_servers
      const response = await fetch(`${baseUrl}/api/episode/${episodeId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data.streaming_servers)) {
        // Nouveau format de l'API : streaming_servers avec URL
        const embedUrls = data.data.streaming_servers
          .filter((server: any) => server.url)
          .sort((a: any, b: any) => {
            // Priorité : HD > SD, serveur 2 > serveur 1 > sibnet
            const priorityA = a.quality === 'HD' ? 2 : (a.quality === 'SD' ? 1 : 0);
            const priorityB = b.quality === 'HD' ? 2 : (b.quality === 'SD' ? 1 : 0);

            if (priorityA !== priorityB) return priorityB - priorityA;

            // Priorité par nom de serveur
            if (a.name.includes('Serveur 2')) return -1;
            if (b.name.includes('Serveur 2')) return 1;
            if (a.name.includes('Serveur 1')) return -1;
            if (b.name.includes('Serveur 1')) return 1;
            return 0;
          })
          .map((server: any) => server.url);

        console.log(`[HLS Extractor] 📊 ${data.data.streaming_servers.length} serveurs trouvés, ${embedUrls.length} embeds extraits`);
        console.log('[HLS Extractor] 🎯 Serveurs:', data.data.streaming_servers.map((s: any) => `${s.name} (${s.quality})`));
        return embedUrls;
      }

      return [];
    } catch (error: any) {
      console.error('[HLS Extractor] ❌ Erreur récupération embeds:', error.message);
      return [];
    }
  }



  /**
   * Fallback vers l'extraction backend si le client échoue
   */
  private async fallbackToBackendExtraction(episodeId: string, startTime: number): Promise<ExtractionResult> {
    console.log(`[HLS Extractor] ❌ Pas de fallback backend disponible pour la nouvelle API`);

    return {
      success: false,
      urls: [],
      error: 'Aucun fallback backend disponible pour cette API',
      extractionTime: Date.now() - startTime
    };
  }

  /**
   * Extrait les URLs HLS depuis une page embed
   */
  private async extractHLSFromEmbed(embedUrl: string): Promise<ExtractionResult> {
    console.log(`[HLS Extractor] 🌐 Tentative d'extraction depuis: ${embedUrl}`);

    // Essayer d'abord sans proxy
    try {
      const result = await this.extractHLSFromUrl(embedUrl);
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.log('[HLS Extractor] ⚠️ Extraction directe échouée, essai avec proxy');
    }

    // Essayer avec des proxies
    for (const proxy of this.PROXY_SERVICES) {
      try {
        const proxiedUrl = proxy + encodeURIComponent(embedUrl);
        const result = await this.extractHLSFromUrl(proxiedUrl);
        if (result.success) {
          console.log(`[HLS Extractor] ✅ Proxy réussi: ${proxy}`);
          return result;
        }
      } catch (error) {
        console.log(`[HLS Extractor] ❌ Proxy échoué: ${proxy}`);
        continue;
      }
    }

    return {
      success: false,
      urls: [],
      error: 'Extraction échouée avec tous les proxies'
    };
  }

       /**
   * Extrait HLS depuis une URL (avec ou sans proxy)
   */
  private async extractHLSFromUrl(url: string): Promise<ExtractionResult> {
    try {
      console.log(`[HLS Extractor] 🌐 Début extraction pour: ${this.getHostFromUrl(url)}`);

      // Headers adaptés selon l'hébergeur
      const hostname = this.getHostFromUrl(url);
      const headers = this.getHeadersForHost(hostname);

      // Créer un timeout manuel compatible React Native
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // Plus de temps pour les serveurs lents

      console.log(`[HLS Extractor] 📤 Envoi requête HTTP vers ${hostname}...`);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log(`[HLS Extractor] 📥 Réponse reçue: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      console.log(`[HLS Extractor] 📄 HTML récupéré: ${html.length} caractères pour ${hostname}`);

      // Vérifier si le HTML est valide
      const isValidHtml = html.trim().startsWith('<') || html.includes('<html') || html.includes('<script') || html.includes('<div');

      if (!isValidHtml) {
        console.log(`[HLS Extractor] ⚠️ HTML invalide ou corrompu, longueur: ${html.length}`);
        const sample = html.substring(0, 100).replace(/[^\x20-\x7E]/g, '?');
        console.log(`[HLS Extractor] 📋 Échantillon nettoyé: ${sample}`);
        throw new Error('HTML corrompu ou compressé');
      }

      // Essayer d'abord l'extraction spécifique à l'hébergeur
      console.log(`[HLS Extractor] 🎯 Tentative extraction spécifique pour ${hostname}...`);
      const specificResult = this.extractWithSpecificStrategy(url, html);
      if (specificResult.length > 0) {
        console.log(`[HLS Extractor] ✅ ${specificResult.length} URLs trouvées avec stratégie spécifique:`, specificResult);
        return {
          success: true,
          urls: specificResult.map(url => ({
            url,
            quality: 'auto',
            type: this.getVideoType(url),
            extractedAt: Date.now(),
            source: 'client' as const
          }))
        };
      }

      // Patterns améliorés pour serveurs de streaming populaires
      console.log(`[HLS Extractor] 🔄 Tentative extraction avancée...`);
      const advancedResult = this.extractWithAdvancedPatterns(html);
      if (advancedResult.length > 0) {
        console.log(`[HLS Extractor] ✅ ${advancedResult.length} URLs trouvées avec patterns avancés:`, advancedResult);
        return {
          success: true,
          urls: advancedResult.map(url => ({
            url,
            quality: 'auto',
            type: this.getVideoType(url),
            extractedAt: Date.now(),
            source: 'client' as const
          }))
        };
      }

      // Fallback sur l'extraction générique
      console.log(`[HLS Extractor] 🔄 Tentative extraction générique...`);
      const hlsUrls = this.extractHLSFromHTML(html);
      if (hlsUrls.length > 0) {
        console.log(`[HLS Extractor] ✅ ${hlsUrls.length} URLs HLS trouvées (générique):`, hlsUrls);
        return {
          success: true,
          urls: hlsUrls.map(url => ({
            url,
            quality: 'auto',
            type: 'hls' as const,
            extractedAt: Date.now(),
            source: 'client' as const
          }))
        };
      }

      // Si pas de HLS trouvé, chercher d'autres patterns vidéo
      console.log(`[HLS Extractor] 🔄 Tentative patterns alternatifs...`);
      const alternativeUrls = this.extractAlternativeVideoUrls(html);
      if (alternativeUrls.length > 0) {
        console.log(`[HLS Extractor] ✅ ${alternativeUrls.length} URLs alternatives trouvées:`, alternativeUrls);
        return {
          success: true,
          urls: alternativeUrls.map(url => ({
            url,
            quality: 'auto',
            type: this.getVideoType(url),
            extractedAt: Date.now(),
            source: 'client' as const
          }))
        };
      }

      return {
        success: false,
        urls: [],
        error: `Aucune URL vidéo trouvée dans ${html.length} caractères de HTML pour ${hostname}. Le serveur utilise peut-être du JavaScript dynamique ou de l'obfuscation avancée.`
      };

    } catch (error: any) {
      console.log(`[HLS Extractor] ❌ Erreur dans extractHLSFromUrl:`, error.message);
      return {
        success: false,
        urls: [],
        error: `Erreur fetch pour ${this.getHostFromUrl(url)}: ${error.message}`
      };
    }
  }

  /**
   * Retourne les headers appropriés selon l'hébergeur
   */
  private getHeadersForHost(hostname: string): Record<string, string> {
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1'
    };

    // Headers spécifiques selon l'hébergeur
    if (hostname.includes('sibnet')) {
      return {
        ...baseHeaders,
        'Referer': 'https://video.sibnet.ru/',
        'Accept-Language': 'ru,en;q=0.9',
      };
    } else if (hostname.includes('vidmoly')) {
      return {
        ...baseHeaders,
        'Referer': 'https://vidmoly.to/',
      };
    } else if (hostname.includes('oneupload')) {
      return {
        ...baseHeaders,
        'Referer': 'https://oneupload.to/',
      };
    } else if (hostname.includes('sendvid')) {
      return {
        ...baseHeaders,
        'Referer': 'https://sendvid.com/',
      };
    }

    return {
      ...baseHeaders,
      'Referer': this.getRefererForUrl(`https://${hostname}/`)
    };
  }

  /**
   * Détermine le type de vidéo selon l'URL
   */
  private getVideoType(url: string): 'hls' | 'mp4' | 'webm' {
    if (url.includes('.m3u8')) return 'hls';
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('.webm')) return 'webm';
    return 'hls'; // Par défaut
  }

  /**
   * Extraction avec patterns avancés pour serveurs modernes
   */
  private extractWithAdvancedPatterns(html: string): string[] {
    const urls = new Set<string>();

    // Patterns JavaScript courants pour players vidéo
    const jsPatterns = [
      // JWPlayer configurations
      /jwplayer\([^)]*\)\.setup\([^}]*file[:\s]*['"](https?:\/\/[^'"]*(?:\.m3u8|\.mp4|\.webm)[^'"]*)['"][^}]*\)/gi,

      // Video.js et players HTML5
      /new\s+Video[^}]*source[:\s]*['"](https?:\/\/[^'"]*(?:\.m3u8|\.mp4|\.webm)[^'"]*)['"][^}]*/gi,

      // Configurations player modernes
      /player[^}]*url[:\s]*['"](https?:\/\/[^'"]*(?:\.m3u8|\.mp4|\.webm)[^'"]*)['"][^}]*/gi,

      // Variables JavaScript contenant des URLs
      /(?:var|let|const)\s+[^=]*=\s*['"](https?:\/\/[^'"]*(?:\.m3u8|\.mp4|\.webm)[^'"]*)['"];/gi,

      // Appels AJAX ou fetch pour récupérer des URLs
      /fetch\([^)]*['"](https?:\/\/[^'"]*(?:api|stream|video)[^'"]*)['"][^)]*/gi,

      // URLs dans des objets de configuration
      /\{[^}]*(?:url|src|file)[:\s]*['"](https?:\/\/[^'"]*(?:\.m3u8|\.mp4|\.webm)[^'"]*)['"][^}]*\}/gi,

      // Patterns pour serveurs populaires
      /(?:sibnet|vidmoly|oneupload|sendvid)[^'"]*['"](https?:\/\/[^'"]*(?:\.m3u8|\.mp4|\.webm)[^'"]*)['"][^"]*/gi,
    ];

    for (const pattern of jsPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        if (url && this.isValidVideoUrl(url)) {
          urls.add(url);
        }
      }
    }

    // Recherche dans les data-attributes HTML5
    const dataAttrPatterns = [
      /data-(?:src|url|file)[=:]\s*['"](https?:\/\/[^'"]*(?:\.m3u8|\.mp4|\.webm)[^'"]*)['"]?/gi,
    ];

    for (const pattern of dataAttrPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        if (url && this.isValidVideoUrl(url)) {
          urls.add(url);
        }
      }
    }

    return Array.from(urls);
  }

  /**
   * Vérifie si une URL est une URL vidéo valide
   */
  private isValidVideoUrl(url: string): boolean {
    if (!url || url.length < 10) return false;
    if (!url.startsWith('http')) return false;
    if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.webm')) return true;
    if (url.includes('stream') || url.includes('video') || url.includes('hls')) return true;
    return false;
  }

  /**
   * Extrait le nom d'hôte d'une URL pour le debug
   */
  private getHostFromUrl(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extrait les sections intéressantes du HTML pour debug
   */
  private extractInterestingSections(html: string): string[] {
    const sections = [];

    // Chercher mentions de "m3u8", "stream", "video", "player"
    const keywords = ['m3u8', 'stream', 'video', 'player', 'source', 'file'];

    for (const keyword of keywords) {
      const regex = new RegExp(`.{0,100}${keyword}.{0,100}`, 'gi');
      const matches = html.match(regex);
      if (matches && matches.length > 0) {
        sections.push(`${keyword}: ${matches.slice(0, 2).join(' | ')}`);
      }
    }

    return sections;
  }

  /**
   * Stratégies d'extraction spécifiques par hébergeur
   */
  private extractWithSpecificStrategy(url: string, html: string): string[] {
    const host = this.getHostFromUrl(url);
    console.log(`[HLS Extractor] 🎯 Stratégie spécifique pour: ${host}`);

    if (host.includes('vidmoly.to')) {
      return this.extractFromVidmoly(html);
    } else if (host.includes('sibnet.ru')) {
      return this.extractFromSibnet(html);
    } else if (host.includes('oneupload.to')) {
      return this.extractFromOneupload(html);
    } else if (host.includes('movearnpre.com')) {
      return this.extractFromMovearnpre(html);
    }

    return [];
  }

  /**
   * Extraction spécifique pour Vidmoly
   */
  private extractFromVidmoly(html: string): string[] {
    const urls = new Set<string>();

    // Patterns spécifiques à Vidmoly
    const patterns = [
      /jwplayer\s*\(\s*['"]\w+['\"]\s*\)\s*\.setup\s*\(\s*\{[^}]*file\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /setup\s*\(\s*\{[^}]*file\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /player\s*\.\s*source\s*\(\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /source:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
    ];

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        if (this.isValidHLSUrl(url)) {
          // URL HLS trouvée (log désactivé)
          urls.add(this.normalizeUrl(url));
        }
      }
    }

    return Array.from(urls);
  }

  /**
   * Extraction spécifique pour Sibnet
   */
  private extractFromSibnet(html: string): string[] {
    const urls = new Set<string>();

    // Patterns pour Sibnet
    const patterns = [
      /src\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /video\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /"src":"(https?:\/\/[^"]*\.m3u8[^"]*)"/gi,
    ];

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        if (this.isValidHLSUrl(url)) {
          console.log(`[HLS Extractor] 🎥 Sibnet URL trouvée: ${url}`);
          urls.add(this.normalizeUrl(url));
        }
      }
    }

    return Array.from(urls);
  }

  /**
   * Extraction spécifique pour OneUpload
   */
  private extractFromOneupload(html: string): string[] {
    const urls = new Set<string>();

    // Patterns pour OneUpload
    const patterns = [
      /file\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /source\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
    ];

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        if (this.isValidHLSUrl(url)) {
          console.log(`[HLS Extractor] 🎥 OneUpload URL trouvée: ${url}`);
          urls.add(this.normalizeUrl(url));
        }
      }
    }

    return Array.from(urls);
  }

  /**
   * Extraction spécifique pour Movearnpre
   */
  private extractFromMovearnpre(html: string): string[] {
    const urls = new Set<string>();

    // Patterns pour Movearnpre
    const patterns = [
      /stream_url\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /video_url\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
    ];

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        if (this.isValidHLSUrl(url)) {
          console.log(`[HLS Extractor] 🎥 Movearnpre URL trouvée: ${url}`);
          urls.add(this.normalizeUrl(url));
        }
      }
    }

    return Array.from(urls);
  }

   /**
    * Détermine le referer approprié selon l'hébergeur
    */
   private getRefererForUrl(url: string): string {
     if (url.includes('vidmoly.to')) return 'https://vidmoly.to/';
     if (url.includes('sibnet.ru')) return 'https://video.sibnet.ru/';
     if (url.includes('oneupload.to')) return 'https://oneupload.to/';
     if (url.includes('movearnpre.com')) return 'https://movearnpre.com/';
     return 'https://google.com/';
   }

   /**
    * Extraction avec patterns alternatifs si HLS standard échoue
    */
   private extractAlternativeVideoUrls(html: string): string[] {
     const alternativePatterns = [
       // Patterns pour vidéos en base64 ou encodées
       /atob\(['"](.*?)['\"]\)/g,
       // Patterns pour configurations cachées
       /video[_\-]?config\s*[:=]\s*['"](.*?)['\"]/gi,
       /stream[_\-]?url\s*[:=]\s*['"](.*?)['\"]/gi,
       // Patterns pour vidmoly spécifique
       /player\s*\.\s*source\s*\(\s*['"](.*?)['\"]/gi,
       /jwplayer.*?file\s*:\s*['"](.*?)['\"]/gi,
       // Patterns pour données JSON cachées
       /"file"\s*:\s*"([^"]*\.m3u8[^"]*)"/gi,
       /"source"\s*:\s*"([^"]*\.m3u8[^"]*)"/gi,
     ];

     const urls = new Set<string>();

     for (const pattern of alternativePatterns) {
       let match;
       pattern.lastIndex = 0;

       while ((match = pattern.exec(html)) !== null) {
         const url = match[1];
         if (url && this.isValidHLSUrl(url)) {
           urls.add(this.normalizeUrl(url));
         }
       }
     }

     return Array.from(urls);
   }

  /**
   * Extrait les URLs HLS depuis le contenu HTML avec patterns étendus
   */
  private extractHLSFromHTML(html: string): string[] {
    const hlsUrls = new Set<string>();

    // Patterns étendus pour HLS
    const extendedPatterns = [
      ...this.HLS_PATTERNS,
      // Patterns spécifiques aux hébergeurs
      /video_url[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /stream[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /url[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      // Pattern pour vidmoly spécifique
      /setup\s*\(\s*\{[^}]*file[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      // Pattern pour configurations JavaScript
      /var\s+\w+\s*=\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      // Pattern pour data attributes
      /data-src[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      // Pattern pour configurations JSON
      /{[^}]*["']file["']\s*:\s*["'](https?:\/\/[^"']*\.m3u8[^"']*)["']/gi,
      // Pattern pour URLs dans window ou variables globales
      /window\.\w+\s*=\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      // Patterns pour jwplayer étendus
      /jwplayer[^}]*file\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /player\s*\.\s*setup[^}]*file\s*:\s*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
    ];

    // Appliquer tous les patterns de recherche
    for (const pattern of extendedPatterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex global

      while ((match = pattern.exec(html)) !== null) {
        const url = match[1] || match[0];
        if (this.isValidHLSUrl(url)) {
          const cleanUrl = this.normalizeUrl(url);
          console.log(`[HLS Extractor] 🔍 HLS trouvé avec pattern: ${url}`);
          hlsUrls.add(cleanUrl);
        }
      }
    }

    // Si aucun HLS trouvé, chercher des patterns cachés
    if (hlsUrls.size === 0) {
      console.log(`[HLS Extractor] 🔍 Aucun HLS standard trouvé, recherche patterns cachés...`);
      this.searchForHiddenVideoUrls(html, hlsUrls);
    }

    return Array.from(hlsUrls);
  }

  /**
   * Recherche patterns cachés ou obfusqués
   */
  private searchForHiddenVideoUrls(html: string, urls: Set<string>): void {
    // Recherche dans les scripts
    const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gis);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        // Recherche d'URLs encodées en base64
        const encodedMatches = script.match(/atob\s*\(\s*['"](.*?)['\"]\s*\)/gi);
        if (encodedMatches) {
          for (const encoded of encodedMatches) {
            try {
              const match = encoded.match(/atob\s*\(\s*['"](.*?)['\"]\s*\)/i);
              if (match) {
                const decoded = atob(match[1]);
                if (decoded.includes('.m3u8')) {
                  console.log(`[HLS Extractor] 🔓 URL décodée trouvée: ${decoded}`);
                  if (this.isValidHLSUrl(decoded)) {
                    urls.add(this.normalizeUrl(decoded));
                  }
                }
              }
            } catch (e) {
              // Ignore les erreurs de décodage
            }
          }
        }
      }
    }

    // Recherche dans les commentaires cachés
    const commentMatches = html.match(/<!--(.*?)-->/gis);
    if (commentMatches) {
      for (const comment of commentMatches) {
        const m3u8Match = comment.match(/https?:\/\/[^"\s]+\.m3u8[^"\s]*/gi);
        if (m3u8Match) {
          for (const url of m3u8Match) {
            if (this.isValidHLSUrl(url)) {
              console.log(`[HLS Extractor] 💬 HLS trouvé dans commentaire: ${url}`);
              urls.add(this.normalizeUrl(url));
            }
          }
        }
      }
    }

    // Recherche dans les attributs data cachés
    const dataMatches = html.match(/data-[^=]*=['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]/gi);
    if (dataMatches) {
      for (const dataMatch of dataMatches) {
        const urlMatch = dataMatch.match(/data-[^=]*=['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]/i);
        if (urlMatch && this.isValidHLSUrl(urlMatch[1])) {
          console.log(`[HLS Extractor] 📋 HLS trouvé dans data-attribute: ${urlMatch[1]}`);
          urls.add(this.normalizeUrl(urlMatch[1]));
        }
      }
    }
  }

  /**
   * Valide qu'une URL est bien un fichier HLS
   */
     private isValidHLSUrl(url: string): boolean {
     return (
       typeof url === 'string' &&
       url.length > 10 &&
       url.includes('.m3u8') &&
       (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//'))
     );
   }

  /**
   * Normalise une URL (ajoute https si besoin, etc.)
   */
  private normalizeUrl(url: string): string {
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    return url;
  }

  /**
   * Valide qu'une URL est bien un embed
   */
  private isValidEmbedUrl(url: string): boolean {
    return (
      typeof url === 'string' &&
      url.length > 10 &&
      (url.startsWith('http://') || url.startsWith('https://')) &&
      (url.includes('embed') ||
       url.includes('vidmoly') ||
       url.includes('sibnet') ||
       url.includes('oneupload') ||
       url.includes('movearnpre') ||
       url.includes('sendvid'))
    );
  }
}

export default new VideoUrlExtractor();
export type { ExtractedVideoUrl, ExtractionResult };
