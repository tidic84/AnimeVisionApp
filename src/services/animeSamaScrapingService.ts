import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Anime, Episode, AnimeStatus, VideoQuality, DownloadStatus } from '../types/anime';
import realParser from './realAnimeSamaParser';
import cacheService from './cacheService';

interface ScrapingConfig {
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  enableRealData: boolean;
}

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface StreamingUrl {
  quality: string;
  url: string;
  type: string;
  server: string;
}

class AnimeSamaScrapingService {
  private axiosInstance: AxiosInstance;
  private config: ScrapingConfig = {
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000,
    enableRealData: true,
  };

  constructor() {
    this.axiosInstance = this.createAxiosInstance();
    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    try {
      await cacheService.initialize();
      await cacheService.cleanup();
    } catch (error) {
      console.warn('Erreur lors de l\'initialisation du cache:', error);
    }
  }

  private createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      // CORRECTION : Forcer la décompression automatique et le bon encoding
      decompress: true,
      responseType: 'text',
      responseEncoding: 'utf8',
      // Suivre les redirections
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      // AJOUT : Transformer la réponse pour s'assurer qu'elle est correctement décodée
      transformResponse: [
        function (data) {
          // Si les données sont du HTML valide, les retourner directement
          if (typeof data === 'string' && data.includes('<html')) {
            return data;
          }
          
          // Si les données semblent corrompues, essayer de les décoder
          if (typeof data === 'string' && data.includes('')) {
            console.warn('[HTTP] Données potentiellement corrompues détectées, tentative de décodage...');
            // Retourner quand même pour debug
            return data;
          }
          
          return data;
        }
      ],
    });

    // Intercepteur pour décoder manuellement si nécessaire
    instance.interceptors.response.use(
      (response) => {
        // Vérifier si la réponse est du texte valide
        if (typeof response.data === 'string' && response.data.length > 0) {
          // Vérifier si c'est du HTML valide
          if (response.data.includes('<html') || response.data.includes('<!DOCTYPE') || response.data.includes('<head')) {
            console.log('[HTTP] HTML valide reçu');
            return response;
          }
          
          // Si le contenu semble corrompu
          if (response.data.includes('')) {
            console.error('[HTTP] Contenu corrompu détecté - problème de décompression');
            throw new Error('Contenu HTML corrompu reçu du serveur');
          }
        }
        
        console.warn('[HTTP] Réponse potentiellement invalide');
        return response;
      },
      (error) => {
        console.error('[HTTP] Erreur de requête:', error.message);
        return Promise.reject(error);
      }
    );

    return instance;
  }

  /**
   * Récupère les derniers épisodes avec cache intelligent
   */
  async getLatestEpisodes(): Promise<Episode[]> {
    try {
      // Vérifier le cache d'abord
      const cachedEpisodes = await cacheService.getLatestEpisodes();
      if (cachedEpisodes && cachedEpisodes.length > 0) {
        console.log(`[Cache HIT] ${cachedEpisodes.length} derniers épisodes récupérés du cache`);
        return cachedEpisodes;
      }

      console.log(`[Cache MISS] Scraping des derniers épisodes depuis anime-sama.fr...`);

      // Scraper la page d'accueil
      const html = await this.fetchWithRetry('https://anime-sama.fr');
      
      // DEBUG: Logger les premiers caractères du HTML pour analyse
      console.log(`[DEBUG HTML] Taille du HTML reçu: ${html.length} caractères`);
      console.log(`[DEBUG HTML] Début du HTML:`, html.substring(0, 500));
      console.log(`[DEBUG HTML] Recherche de "épisodes":`, html.toLowerCase().includes('épisodes'));
      console.log(`[DEBUG HTML] Recherche de "derniers":`, html.toLowerCase().includes('derniers'));
      
      const parsedEpisodes = realParser.parseLatestEpisodes(html);

      if (parsedEpisodes.length === 0) {
        throw new Error('Aucun épisode trouvé sur anime-sama.fr. Le site pourrait avoir changé de structure.');
      }

      // Convertir les données parsées en objets Episode
      const episodes: Episode[] = parsedEpisodes.map(parsed => ({
        id: `${parsed.animeSlug}-episode-${parsed.episodeNumber}`,
        animeId: parsed.animeSlug,
        number: parsed.episodeNumber,
        title: `${parsed.animeTitle} - Épisode ${parsed.episodeNumber}`,
        thumbnail: parsed.thumbnail,
        duration: 1440, // 24 minutes
        streamingUrls: [],
        isWatched: false,
        watchProgress: 0,
        downloadStatus: 'NOT_DOWNLOADED' as any,
      }));

      // Mettre en cache
      await cacheService.setLatestEpisodes(episodes);
      
      console.log(`[Scraping SUCCESS] ${episodes.length} derniers épisodes récupérés d'anime-sama.fr`);
      return episodes;

    } catch (error) {
      // SUPPRIMÉ : Plus de fallback sur le cache expiré
      // Lancer directement l'erreur pour indiquer que le scraping a échoué
      console.error('[Scraping FAILED] Impossible de récupérer les derniers épisodes depuis anime-sama.fr');
      throw new Error(`Échec du scraping des derniers épisodes: ${(error as Error).message}`);
    }
  }

  /**
   * Récupère les animés populaires avec cache
   */
  async getPopularAnimes(): Promise<Anime[]> {
    try {
      // Vérifier le cache d'abord
      const cachedAnimes = await cacheService.getPopularAnimes();
      if (cachedAnimes && cachedAnimes.length > 0) {
        console.log(`[Cache HIT] ${cachedAnimes.length} animés populaires récupérés du cache`);
        return cachedAnimes;
      }

      console.log(`[Cache MISS] Scraping des animés populaires depuis anime-sama.fr...`);

      // Scraper la page d'accueil pour les classiques
      const html = await this.fetchWithRetry('https://anime-sama.fr');
      
      // DEBUG: Logger pour identifier la structure des classiques
      console.log(`[DEBUG HTML] Recherche de "classiques":`, html.toLowerCase().includes('classiques'));
      console.log(`[DEBUG HTML] Recherche de "populaires":`, html.toLowerCase().includes('populaires'));
      
      const parsedAnimes = realParser.parseClassicAnimes(html);

      if (parsedAnimes.length === 0) {
        throw new Error('Aucun animé populaire trouvé sur anime-sama.fr. Le site pourrait avoir changé de structure.');
      }

      // Convertir les données parsées en objets Anime
      const animes: Anime[] = parsedAnimes.map(parsed => ({
        id: parsed.slug,
        title: parsed.title,
        thumbnail: parsed.thumbnail,
        banner: parsed.banner,
        synopsis: parsed.synopsis,
        genres: parsed.genres,
        year: parsed.year,
        status: parsed.status,
        rating: parsed.rating,
        episodeCount: parsed.episodeCount || 24,
        duration: 24, // durée en minutes
        studio: parsed.studio,
      }));

      // Mettre en cache
      await cacheService.setPopularAnimes(animes);
      
      console.log(`[Scraping SUCCESS] ${animes.length} animés populaires récupérés d'anime-sama.fr`);
      return animes;

    } catch (error) {
      // SUPPRIMÉ : Plus de fallback sur le cache expiré
      // Lancer directement l'erreur pour indiquer que le scraping a échoué
      console.error('[Scraping FAILED] Impossible de récupérer les animés populaires depuis anime-sama.fr');
      throw new Error(`Échec du scraping des animés populaires: ${(error as Error).message}`);
    }
  }

  /**
   * Récupère les détails d'un animé avec cache
   */
  async getAnimeDetails(animeId: string): Promise<Anime | null> {
    try {
      // Vérifier le cache d'abord
      const cachedAnime = await cacheService.getAnimeDetails(animeId);
      if (cachedAnime) {
        console.log(`[Cache HIT] Détails de ${animeId} récupérés du cache`);
        return cachedAnime;
      }

      console.log(`[Cache MISS] Scraping des détails de ${animeId} depuis anime-sama.fr...`);

      // Scraper la page de l'animé
      const animeUrl = `https://anime-sama.fr/catalogue/${animeId}/`;
      const html = await this.fetchWithRetry(animeUrl);
      const parsed = realParser.parseAnimeDetails(html, animeId);

      if (!parsed) {
        throw new Error(`Impossible de parser les détails de l'animé ${animeId} depuis anime-sama.fr`);
      }

      const anime: Anime = {
        id: parsed.slug,
        title: parsed.title,
        thumbnail: parsed.thumbnail,
        banner: parsed.banner,
        synopsis: parsed.synopsis,
        genres: parsed.genres,
        year: parsed.year,
        status: parsed.status,
        rating: parsed.rating,
        episodeCount: parsed.episodeCount || 24,
        duration: 24, // durée en minutes
        studio: parsed.studio,
      };

      // Mettre en cache
      await cacheService.setAnimeDetails(animeId, anime);
      
      console.log(`[Scraping SUCCESS] Détails de ${animeId} récupérés d'anime-sama.fr`);
      return anime;

    } catch (error) {
      // SUPPRIMÉ : Plus de fallback sur le cache expiré
      console.error(`[Scraping FAILED] Impossible de récupérer les détails de ${animeId} depuis anime-sama.fr`);
      throw new Error(`Échec du scraping des détails de ${animeId}: ${(error as Error).message}`);
    }
  }

  /**
   * Récupère les épisodes d'un animé avec cache
   */
  async getAnimeEpisodes(animeId: string): Promise<Episode[]> {
    try {
      // Vérifier le cache d'abord
      const cachedEpisodes = await cacheService.getAnimeEpisodes(animeId);
      if (cachedEpisodes && cachedEpisodes.length > 0) {
        console.log(`[Cache HIT] ${cachedEpisodes.length} épisodes de ${animeId} récupérés du cache`);
        return cachedEpisodes;
      }

      console.log(`[Cache MISS] Scraping des épisodes de ${animeId} depuis anime-sama.fr...`);

      // Scraper la page de l'animé
      const animeUrl = `https://anime-sama.fr/catalogue/${animeId}/`;
      const html = await this.fetchWithRetry(animeUrl);
      const episodes = realParser.parseAnimeEpisodes(html, animeId);

      if (episodes.length === 0) {
        throw new Error(`Aucun épisode trouvé pour ${animeId} sur anime-sama.fr`);
      }

      // Mettre en cache
      await cacheService.setAnimeEpisodes(animeId, episodes);
      
      console.log(`[Scraping SUCCESS] ${episodes.length} épisodes de ${animeId} récupérés d'anime-sama.fr`);
      return episodes;

    } catch (error) {
      // SUPPRIMÉ : Plus de fallback sur le cache expiré
      console.error(`[Scraping FAILED] Impossible de récupérer les épisodes de ${animeId} depuis anime-sama.fr`);
      throw new Error(`Échec du scraping des épisodes de ${animeId}: ${(error as Error).message}`);
    }
  }

  /**
   * Recherche d'animés - Non implémentée pour le scraping réel
   */
  async searchAnime(query: string): Promise<Anime[]> {
    console.error('[Scraping FAILED] La recherche d\'animés n\'est pas implémentée pour le scraping réel');
    throw new Error('Fonction de recherche non implémentée - impossible de chercher des animés');
  }

  /**
   * Force le refresh des données (pour pull-to-refresh)
   */
  async forceRefresh(): Promise<{
    latestEpisodes: Episode[];
    popularAnimes: Anime[];
  }> {
    try {
      console.log('[forceRefresh] Effacement du cache et rechargement...');
      
      // Vider tout le cache pour forcer le rechargement
      await cacheService.clearAll();
      
      const [latestEpisodes, popularAnimes] = await Promise.all([
        this.getLatestEpisodes(),
        this.getPopularAnimes()
      ]);

      return { latestEpisodes, popularAnimes };
    } catch (error) {
      console.error('[forceRefresh] Erreur:', error);
      throw error;
    }
  }

  // Méthode temporaire pour vider le cache et retester
  async clearAllCache(): Promise<void> {
    console.log('[clearAllCache] Suppression complète du cache...');
    await cacheService.clearAll();
    console.log('[clearAllCache] Cache vidé - prochaine requête utilisera le scraping réel');
  }

  /**
   * Statistiques du cache
   */
  getCacheStats() {
    return cacheService.getStats();
  }

  /**
   * Vérifie si le cache de la page d'accueil est complet
   */
  async hasCompleteHomeCache(): Promise<boolean> {
    return cacheService.hasCompleteHomeCache();
  }

  /**
   * Retourne l'âge du cache en minutes
   */
  getCacheAge() {
    return cacheService.getCacheAge();
  }

  /**
   * Récupère les URLs de streaming pour un épisode
   */
  async getEpisodeStreamingUrls(episodeId: string): Promise<{
    quality: string;
    url: string;
    type: string;
    server: string;
  }[]> {
    try {
      console.log(`[Scraping] Récupération des URLs de streaming pour ${episodeId}`);
      
      // Pour l'instant, utiliser le parser avec des URLs de test
      // TODO: Scraper la vraie page de l'épisode sur anime-sama.fr
      const streamingUrls = realParser.parseEpisodeStreamingUrls('', episodeId);
      
      console.log(`[Scraping] ${streamingUrls.length} URLs de streaming récupérées pour ${episodeId}`);
      return streamingUrls;

    } catch (error) {
      console.error(`Erreur lors de la récupération des URLs de streaming pour ${episodeId}:`, error);
      throw error;
    }
  }

  // Méthodes utilitaires privées
  private async fetchWithRetry(url: string, attempt: number = 1): Promise<string> {
    console.log(`[HTTP] Scraping dynamique requis pour ${url} (tentative ${attempt})`);
    throw new Error('Le scraping de sites dynamiques nécessite WebView - utilisez fetchWithWebView()');
  }

  /**
   * Méthode pour scraper avec WebView (nécessaire pour le contenu dynamique)
   * Cette méthode doit être appelée depuis un composant React Native avec accès à WebView
   */
  async fetchWithWebView(url: string): Promise<string> {
    throw new Error('fetchWithWebView doit être implémentée dans le composant UI avec WebView');
  }

  // Méthode de test pour diagnostiquer les problèmes réseau
  async testFetch(): Promise<{success: boolean, details: string}> {
    try {
      console.log('[TEST] Test de connectivité réseau...');
      
      // Test 1: Site simple
      try {
        const response1 = await fetch('https://httpbin.org/get');
        const data1 = await response1.text();
        console.log('[TEST] httpbin.org OK:', data1.length, 'caractères');
      } catch (e) {
        console.error('[TEST] httpbin.org FAIL:', (e as Error).message);
        return {success: false, details: `httpbin.org failed: ${(e as Error).message}`};
      }
      
      // Test 2: Google
      try {
        const response2 = await fetch('https://www.google.com');
        const data2 = await response2.text();
        console.log('[TEST] google.com OK:', data2.length, 'caractères');
      } catch (e) {
        console.error('[TEST] google.com FAIL:', (e as Error).message);
        return {success: false, details: `google.com failed: ${(e as Error).message}`};
      }
      
      // Test 3: anime-sama.fr
      try {
        const response3 = await fetch('https://anime-sama.fr');
        const data3 = await response3.text();
        console.log('[TEST] anime-sama.fr OK:', data3.length, 'caractères');
        console.log('[TEST] anime-sama.fr contient HTML:', data3.includes('<html'));
        console.log('[TEST] anime-sama.fr contient épisodes:', data3.toLowerCase().includes('épisodes'));
        return {success: true, details: `Tous les tests réussis. anime-sama.fr: ${data3.length} caractères`};
      } catch (e) {
        console.error('[TEST] anime-sama.fr FAIL:', (e as Error).message);
        return {success: false, details: `anime-sama.fr failed: ${(e as Error).message}`};
      }
      
    } catch (error) {
      console.error('[TEST] Erreur générale:', error);
      return {success: false, details: `General error: ${(error as Error).message}`};
    }
  }
}

export default new AnimeSamaScrapingService(); 