import axios from 'axios';
import { Anime, Episode, AnimeStatus, VideoQuality } from '../types/anime';
import animeSamaScrapingService from './animeSamaScrapingService';
import databaseService from './databaseService';
import apiService from './apiService';

interface StreamingUrl {
  quality: string;
  url: string;
  type: string;
  server: string;
}

class AnimeSamaService {
  private baseUrl = 'https://anime-sama.fr';
  private useRealScraping: boolean = true;
  private useApi: boolean = true;

  constructor() {
    // Configuration globale d'axios pour le service
    axios.defaults.timeout = 10000;
  }

  /**
   * Active le scraping réel
   */
  enableRealScraping(): void {
    this.useRealScraping = true;
    console.log('[AnimeSamaService] Scraping réel activé');
  }

  /**
   * Désactive le scraping réel (mode données mockées)
   */
  disableRealScraping(): void {
    this.useRealScraping = false;
    console.log('[AnimeSamaService] Mode données mockées activé');
  }

  /**
   * Active l'utilisation de l'API
   */
  enableApi(): void {
    this.useApi = true;
    console.log('[AnimeSamaService] API activée');
  }

  /**
   * Désactive l'utilisation de l'API (fallback vers scraping)
   */
  disableApi(): void {
    this.useApi = false;
    console.log('[AnimeSamaService] API désactivée - fallback vers scraping');
  }

  /**
   * Récupère les derniers épisodes ajoutés
   */
  async getLatestEpisodes(): Promise<Episode[]> {
    try {
      let episodes: Episode[];
      
      if (this.useApi) {
        console.log('[AnimeSamaService] Utilisation de l\'API pour les derniers épisodes');
        try {
          episodes = await apiService.getLatestEpisodes();
        } catch (apiError) {
          console.warn('[AnimeSamaService] Erreur API, fallback vers scraping:', apiError);
          episodes = await animeSamaScrapingService.getLatestEpisodes();
        }
      } else {
        episodes = await animeSamaScrapingService.getLatestEpisodes();
      }
      
      // Enrichir avec les données locales (statut de visionnage, etc.)
      const enrichedEpisodes = await this.enrichEpisodesWithLocalData(episodes);
      
      return enrichedEpisodes;
    } catch (error) {
      console.error('Erreur réseau lors de la récupération des derniers épisodes:', error);
      throw error; // Remonter l'erreur à l'interface utilisateur
    }
  }

  /**
   * Recherche d'animés par titre
   */
  async searchAnime(query: string): Promise<Anime[]> {
    try {
      let animes: Anime[];
      
      if (this.useApi) {
        console.log('[AnimeSamaService] Utilisation de l\'API pour la recherche');
        try {
          animes = await apiService.searchAnimes(query);
        } catch (apiError) {
          console.warn('[AnimeSamaService] Erreur API, fallback vers scraping:', apiError);
          animes = await animeSamaScrapingService.searchAnime(query);
        }
      } else {
        animes = await animeSamaScrapingService.searchAnime(query);
      }
      
      // Enrichir avec les données locales (favoris, statut de visionnage, etc.)
      const enrichedAnimes = await this.enrichAnimesWithLocalData(animes);
      
      return enrichedAnimes;
    } catch (error) {
      console.error('Erreur réseau lors de la recherche d\'animés:', error);
      throw error; // Remonter l'erreur à l'interface utilisateur
    }
  }

  /**
   * Récupère les détails d'un animé
   */
  async getAnimeDetails(animeId: string): Promise<Anime | null> {
    try {
      let anime: Anime | null = null;
      
      if (this.useApi) {
        console.log('[AnimeSamaService] Utilisation de l\'API pour les détails d\'animé');
        try {
          anime = await apiService.getAnimeById(animeId);
        } catch (apiError) {
          console.warn('[AnimeSamaService] Erreur API, fallback vers scraping:', apiError);
          anime = await animeSamaScrapingService.getAnimeDetails(animeId);
        }
      } else {
        anime = await animeSamaScrapingService.getAnimeDetails(animeId);
      }
      
      if (!anime) return null;
      
      // Enrichir avec les données locales
      const enrichedAnime = await this.enrichAnimeWithLocalData(anime);
      
      return enrichedAnime;
    } catch (error) {
      console.error(`Erreur réseau lors de la récupération des détails de ${animeId}:`, error);
      throw error; // Remonter l'erreur à l'interface utilisateur
    }
  }

  /**
   * Récupère les épisodes d'un animé
   */
  async getAnimeEpisodes(animeId: string): Promise<Episode[]> {
    try {
      const episodes = await animeSamaScrapingService.getAnimeEpisodes(animeId);
      
      // Enrichir avec les données locales
      const enrichedEpisodes = await this.enrichEpisodesWithLocalData(episodes);
      
      return enrichedEpisodes;
    } catch (error) {
      console.error(`Erreur réseau lors de la récupération des épisodes de ${animeId}:`, error);
      throw error; // Remonter l'erreur à l'interface utilisateur
    }
  }

  /**
   * Récupère les animés populaires/classiques
   */
  async getPopularAnimes(): Promise<Anime[]> {
    try {
      let animes: Anime[];
      
      if (this.useApi) {
        console.log('[AnimeSamaService] Utilisation de l\'API pour les animés populaires');
        try {
          animes = await apiService.getPopularAnimes();
        } catch (apiError) {
          console.warn('[AnimeSamaService] Erreur API, fallback vers scraping:', apiError);
          animes = await animeSamaScrapingService.getPopularAnimes();
        }
      } else {
        animes = await animeSamaScrapingService.getPopularAnimes();
      }
      
      // Enrichir avec les données locales
      const enrichedAnimes = await this.enrichAnimesWithLocalData(animes);
      
      return enrichedAnimes;
    } catch (error) {
      console.error('Erreur réseau lors de la récupération des animés populaires:', error);
      throw error; // Remonter l'erreur à l'interface utilisateur
    }
  }

  /**
   * Récupère les URLs de streaming pour un épisode
   */
  async getEpisodeStreamingUrls(episodeId: string): Promise<StreamingUrl[]> {
    try {
      console.log(`[AnimeSamaService] Récupération des URLs de streaming pour ${episodeId}`);
      
      // Utiliser le service de scraping pour récupérer les URLs
      const streamingUrls = await animeSamaScrapingService.getEpisodeStreamingUrls(episodeId);
      
      console.log(`[AnimeSamaService] ${streamingUrls.length} URLs de streaming récupérées pour ${episodeId}`);
      return streamingUrls;
    } catch (error) {
      console.error(`Erreur lors de la récupération des URLs de streaming pour ${episodeId}:`, error);
      throw error; // Remonter l'erreur à l'interface utilisateur
    }
  }

  /**
   * Vérifie si un épisode a des URLs de streaming disponibles
   */
  async hasStreamingUrls(episodeId: string): Promise<boolean> {
    try {
      const urls = await this.getEpisodeStreamingUrls(episodeId);
      return urls.length > 0;
    } catch (error) {
      console.warn(`Impossible de vérifier les URLs pour ${episodeId}:`, error);
      return false;
    }
  }

  /**
   * Teste la disponibilité des vidéos pour un épisode (pour debug)
   */
  async testEpisodeAvailability(episodeId: string): Promise<{
    episodeExists: boolean;
    hasStreamingUrls: boolean;
    urlCount: number;
    error?: string;
  }> {
    try {
      console.log(`[Test] Vérification de la disponibilité de ${episodeId}`);
      
      // Extraire l'animeId depuis l'episodeId
      const animeId = episodeId.split('-episode-')[0];
      
      // Vérifier si l'épisode existe
      const episodes = await this.getAnimeEpisodes(animeId);
      const episode = episodes.find(ep => ep.id === episodeId);
      
      if (!episode) {
        return {
          episodeExists: false,
          hasStreamingUrls: false,
          urlCount: 0,
          error: 'Épisode non trouvé'
        };
      }

      // Vérifier les URLs de streaming
      const hasUrls = await this.hasStreamingUrls(episodeId);
      const urls = hasUrls ? await this.getEpisodeStreamingUrls(episodeId) : [];
      
      return {
        episodeExists: true,
        hasStreamingUrls: hasUrls,
        urlCount: urls.length,
      };

    } catch (error) {
      return {
        episodeExists: false,
        hasStreamingUrls: false,
        urlCount: 0,
        error: (error as Error).message
      };
    }
  }

  /**
   * Force le refresh des données (pour pull-to-refresh)
   */
  async forceRefresh(): Promise<{
    latestEpisodes: Episode[];
    popularAnimes: Anime[];
  }> {
    try {
      console.log('[AnimeSamaService] Début du refresh forcé...');
      
      // Utiliser le service de scraping pour forcer le refresh
      const { latestEpisodes, popularAnimes } = await animeSamaScrapingService.forceRefresh();
      
      // Enrichir les données avec les informations locales
      const enrichedLatestEpisodes = await this.enrichEpisodesWithLocalData(latestEpisodes);
      const enrichedPopularAnimes = await this.enrichAnimesWithLocalData(popularAnimes);
      
      console.log(`[AnimeSamaService] Refresh terminé: ${enrichedLatestEpisodes.length} épisodes, ${enrichedPopularAnimes.length} animés`);
      
      return {
        latestEpisodes: enrichedLatestEpisodes,
        popularAnimes: enrichedPopularAnimes,
      };
    } catch (error) {
      console.error('Erreur réseau lors du refresh forcé:', error);
      throw error; // Remonter l'erreur à l'interface utilisateur
    }
  }

  /**
   * Statistiques du cache
   */
  getCacheStats() {
    return animeSamaScrapingService.getCacheStats();
  }

  /**
   * Vérifie si le cache de la page d'accueil est complet
   */
  async hasCompleteHomeCache(): Promise<boolean> {
    return animeSamaScrapingService.hasCompleteHomeCache();
  }

  /**
   * Retourne l'âge du cache en minutes
   */
  getCacheAge() {
    return animeSamaScrapingService.getCacheAge();
  }

  /**
   * Teste la connectivité réseau et l'accès à anime-sama.fr
   */
  async testFetch(): Promise<{success: boolean, details: string}> {
    return await animeSamaScrapingService.testFetch();
  }

  /**
   * Teste la connectivité à l'API
   */
  async testApiConnection(): Promise<{success: boolean, details: string}> {
    try {
      const isConnected = await apiService.testConnection();
      if (isConnected) {
        return {
          success: true,
          details: 'API accessible et fonctionnelle'
        };
      } else {
        return {
          success: false,
          details: 'API non accessible'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        details: `Erreur API: ${error.message}`
      };
    }
  }

  /**
   * Force l'utilisation du scraping en cas de problème d'API
   */
  async checkAndFallbackToScraping(): Promise<void> {
    try {
      const apiTest = await this.testApiConnection();
      if (!apiTest.success) {
        console.warn('[AnimeSamaService] API non disponible, basculement vers scraping');
        this.disableApi();
      } else {
        this.enableApi();
      }
    } catch (error) {
      console.warn('[AnimeSamaService] Erreur test API, basculement vers scraping');
      this.disableApi();
    }
  }

  /**
   * Vide complètement le cache pour forcer un nouveau scraping
   */
  async clearAllCache(): Promise<void> {
    return await animeSamaScrapingService.clearAllCache();
  }

  // Méthodes d'enrichissement des données avec informations locales
  private async enrichAnimesWithLocalData(animes: Anime[]): Promise<Anime[]> {
    return Promise.all(animes.map(anime => this.enrichAnimeWithLocalData(anime)));
  }

  private async enrichAnimeWithLocalData(anime: Anime): Promise<Anime> {
    try {
      // Récupérer l'historique de visionnage
      const watchHistory = await databaseService.getWatchHistory();
      const animeHistory = watchHistory.filter(h => h.animeId === anime.id);
      
      // Pour l'instant, retourner l'animé tel quel
      // TODO: Ajouter les propriétés d'enrichissement quand elles seront ajoutées au type Anime
      return anime;
    } catch (error) {
      console.warn(`Erreur lors de l'enrichissement de ${anime.id}:`, error);
      return anime;
    }
  }

  private async enrichEpisodesWithLocalData(episodes: Episode[]): Promise<Episode[]> {
    try {
      const watchHistory = await databaseService.getWatchHistory();
      
      return episodes.map(episode => {
        const history = watchHistory.find(h => h.episodeId === episode.id);
        
        return {
          ...episode,
          isWatched: history ? history.progress >= 90 : false,
          watchProgress: history ? history.progress : 0,
        };
      });
    } catch (error) {
      console.warn('Erreur lors de l\'enrichissement des épisodes:', error);
      return episodes;
    }
  }
}

export default new AnimeSamaService(); 