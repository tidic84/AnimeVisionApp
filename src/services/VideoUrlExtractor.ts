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
class VideoUrlExtractor {
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
      const baseUrl = API_ADDRESS || 'http://localhost:8000';
      
      // Essayer l'endpoint pour récupérer les embeds (nouveau format)
      const response = await fetch(`${baseUrl}/api/v1/mobile/episode/${episodeId}/streaming/embeds`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Fallback: utiliser l'endpoint normal et extraire les embeds
        return await this.getEmbedUrlsFromStreamingEndpoint(episodeId);
      }

      const data = await response.json();
      
      if (data.success && Array.isArray(data.servers)) {
        // Nouveau format : servers avec embed_url
        const embedUrls = data.servers
          .filter((server: any) => server.embed_url)
          .sort((a: any, b: any) => {
            // Priorité : vidmoly > sendvid > autres
            if (a.server_type === 'vidmoly') return -1;
            if (b.server_type === 'vidmoly') return 1;
            if (a.server_type === 'sendvid') return -1;
            if (b.server_type === 'sendvid') return 1;
            return 0;
          })
          .map((server: any) => server.embed_url);
        
        console.log(`[HLS Extractor] 📊 ${data.servers.length} serveurs trouvés, ${embedUrls.length} embeds extraits`);
        console.log('[HLS Extractor] 🎯 Serveurs:', data.servers.map((s: any) => `${s.name} (${s.server_type})`));
        return embedUrls;
      }

      return [];
    } catch (error) {
      console.log('[HLS Extractor] ⚠️ Endpoint embeds indisponible, fallback');
      return await this.getEmbedUrlsFromStreamingEndpoint(episodeId);
    }
  }

     /**
    * Fallback : récupérer embeds depuis l'endpoint streaming normal
    */
   private async getEmbedUrlsFromStreamingEndpoint(episodeId: string): Promise<string[]> {
     const baseUrl = API_ADDRESS || 'http://localhost:8000';
     
     const response = await fetch(`${baseUrl}/api/v1/mobile/episode/${episodeId}/streaming`, {
       method: 'GET',
       headers: {
         'Accept': 'application/json',
         'Content-Type': 'application/json',
       },
     });

     if (!response.ok) {
       throw new Error(`Erreur API: ${response.status}`);
     }

     const data = await response.json();
     
     // Chercher les URLs embed dans la réponse selon votre format API
     const embedUrls: string[] = [];
     
     if (data.success) {
       // Nouveau format : base_servers avec embed_url
       if (Array.isArray(data.base_servers)) {
         embedUrls.push(...data.base_servers
           .filter((server: any) => server.embed_url && 
             (server.embed_url.includes('embed') || 
              server.embed_url.includes('vidmoly') || 
              server.embed_url.includes('sibnet') ||
              server.embed_url.includes('sendvid')))
           .map((server: any) => server.embed_url)
         );
       }
       
       // Format actuel : streaming_servers avec url
       if (data.data && Array.isArray(data.data.streaming_servers)) {
         console.log(`[HLS Extractor] 📊 ${data.data.streaming_servers.length} serveurs trouvés dans streaming_servers`);
         embedUrls.push(...data.data.streaming_servers
           .filter((server: any) => server.url && server.type === 'embed')
           .map((server: any) => server.url)
         );
       }
       
       // Fallback : hls_url direct
       if (data.data && data.data.hls_url) {
         console.log(`[HLS Extractor] 📺 hls_url trouvé: ${data.data.hls_url}`);
         embedUrls.push(data.data.hls_url);
       }
       
       // Ancien format pour compatibilité
       if (Array.isArray(data.embed_urls)) {
         embedUrls.push(...data.embed_urls);
       }
       
       if (data.data && Array.isArray(data.data.embed_urls)) {
         embedUrls.push(...data.data.embed_urls);
       }
     }

     console.log(`[HLS Extractor] ✅ ${embedUrls.length} URLs embed extraites:`, embedUrls);
     return embedUrls;
   }

  /**
   * Fallback vers l'extraction backend si le client échoue
   */
  private async fallbackToBackendExtraction(episodeId: string, startTime: number): Promise<ExtractionResult> {
    const baseUrl = API_ADDRESS || 'http://localhost:8000';
    
    try {
      console.log(`[HLS Extractor] 🔄 Tentative extraction backend pour épisode ${episodeId}`);
      
      // Créer un timeout manuel compatible React Native
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`${baseUrl}/api/v1/mobile/episode/${episodeId}/streaming/fresh`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API backend error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.fresh_hls_urls && data.fresh_hls_urls.length > 0) {
        console.log(`[HLS Extractor] ✅ Backend extraction réussie: ${data.fresh_hls_urls.length} URLs`);
        
        return {
          success: true,
          urls: data.fresh_hls_urls.map((item: any) => ({
            url: item.url,
            quality: item.quality || 'auto',
            type: 'hls' as const,
            extractedAt: item.extracted_at || Date.now(),
            source: 'server' as const
          })),
          extractionTime: Date.now() - startTime
        };
      } else {
        throw new Error('Backend API returned no valid HLS URLs');
      }

    } catch (error: any) {
      console.log(`[HLS Extractor] ❌ Backend extraction échouée:`, error.message);
      
      return {
        success: false,
        urls: [],
        error: `Échec extraction client et backend: ${error.message}`,
        extractionTime: Date.now() - startTime
      };
    }
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
      
      // Headers simplifiés SANS compression pour éviter le HTML corrompu
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': this.getRefererForUrl(url),
        'DNT': '1'
      };

      // Créer un timeout manuel compatible React Native
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      console.log(`[HLS Extractor] 📤 Envoi requête HTTP...`);
      
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
      console.log(`[HLS Extractor] 📄 HTML récupéré: ${html.length} caractères pour ${this.getHostFromUrl(url)}`);
      
      // Vérifier si le HTML est valide (commence par < ou contient des balises HTML)
      const isValidHtml = html.trim().startsWith('<') || html.includes('<html') || html.includes('<script') || html.includes('<div');
      
      if (!isValidHtml) {
        console.log(`[HLS Extractor] ⚠️ HTML invalide ou corrompu, longueur: ${html.length}`);
        const sample = html.substring(0, 100).replace(/[^\x20-\x7E]/g, '?');
        console.log(`[HLS Extractor] 📋 Échantillon nettoyé: ${sample}`);
        throw new Error('HTML corrompu ou compressé');
      }
      
      // Log un échantillon propre du HTML
      if (html.length > 0) {
        const sample = html.substring(0, 300);
        console.log(`[HLS Extractor] 📋 Début HTML:`, sample);
        
        // Chercher les parties intéressantes dans le HTML
        const interestingParts = this.extractInterestingSections(html);
        if (interestingParts.length > 0) {
          console.log(`[HLS Extractor] 🔍 Sections intéressantes trouvées:`, interestingParts);
        } else {
          console.log(`[HLS Extractor] ⚠️ Aucune section intéressante trouvée dans le HTML`);
        }
      }

      // Essayer d'abord l'extraction spécifique à l'hébergeur
      console.log(`[HLS Extractor] 🎯 Tentative extraction spécifique...`);
      const specificResult = this.extractWithSpecificStrategy(url, html);
      if (specificResult.length > 0) {
        console.log(`[HLS Extractor] 🎯 ${specificResult.length} URLs trouvées avec stratégie spécifique:`, specificResult);
        return {
          success: true,
          urls: specificResult.map(url => ({
            url,
            quality: 'auto',
            type: 'hls' as const,
            extractedAt: Date.now(),
            source: 'client' as const
          }))
        };
      } else {
        console.log(`[HLS Extractor] ❌ Stratégie spécifique n'a rien trouvé`);
      }

      // Fallback sur l'extraction générique
      console.log(`[HLS Extractor] 🔄 Tentative extraction générique...`);
      const hlsUrls = this.extractHLSFromHTML(html);
      if (hlsUrls.length > 0) {
        console.log(`[HLS Extractor] 🎯 ${hlsUrls.length} URLs HLS trouvées (générique):`, hlsUrls);
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
      } else {
        console.log(`[HLS Extractor] ❌ Extraction générique n'a rien trouvé`);
      }

      // Si pas de HLS trouvé, chercher d'autres patterns
      console.log(`[HLS Extractor] 🔄 Tentative patterns alternatifs...`);
      const alternativeUrls = this.extractAlternativeVideoUrls(html);
      if (alternativeUrls.length > 0) {
        console.log(`[HLS Extractor] 📺 ${alternativeUrls.length} URLs alternatives trouvées:`, alternativeUrls);
        return {
          success: true,
          urls: alternativeUrls.map(url => ({
            url,
            quality: 'auto',
            type: 'hls' as const,
            extractedAt: Date.now(),
            source: 'client' as const
          }))
        };
      } else {
        console.log(`[HLS Extractor] ❌ Patterns alternatifs n'ont rien trouvé`);
      }

      return {
        success: false,
        urls: [],
        error: `Aucun HLS trouvé dans ${html.length} caractères de HTML pour ${this.getHostFromUrl(url)}`
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