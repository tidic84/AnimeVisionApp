import { Episode, Anime } from '../types/anime';
import apiService from './apiService';
import animeSamaService from './animeSamaService';

interface HybridConfig {
  preferApiServer: boolean;
  apiServerTimeout: number;
  enableFallback: boolean;
}

class HybridScrapingService {
  private config: HybridConfig;
  private isApiServerAvailable: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.config = {
      preferApiServer: true, // Préférer le serveur API
      apiServerTimeout: 10000, // 10 secondes
      enableFallback: true, // Activer le fallback
    };
    
    this.checkApiServerHealth();
  }

  private async checkApiServerHealth(): Promise<boolean> {
    const now = Date.now();
    
    // Éviter de vérifier trop souvent
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.isApiServerAvailable) {
      return this.isApiServerAvailable;
    }

    try {
      console.log('[HybridService] Vérification de la santé du serveur API...');
      const isAvailable = await apiService.testConnection();
      this.isApiServerAvailable = isAvailable;
      this.lastHealthCheck = now;
      
      console.log(`[HybridService] Serveur API ${isAvailable ? 'DISPONIBLE' : 'INDISPONIBLE'}`);
      return isAvailable;
      
    } catch (error) {
      console.warn('[HybridService] Serveur API inaccessible:', error);
      this.isApiServerAvailable = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  async getLatestEpisodes(): Promise<Episode[]> {
    // Stratégie 1: Essayer le serveur API d'abord
    if (this.config.preferApiServer) {
      const apiAvailable = await this.checkApiServerHealth();
      
      if (apiAvailable) {
        try {
          console.log('[HybridService] Utilisation du serveur API pour les épisodes');
          const episodes = await apiService.getLatestEpisodes();
          
          if (episodes && episodes.length > 0) {
            console.log(`[HybridService API SUCCESS] ${episodes.length} épisodes récupérés`);
            return episodes;
          }
        } catch (error) {
          console.warn('[HybridService] Erreur serveur API pour épisodes:', error);
          this.isApiServerAvailable = false;
        }
      }
    }

    // Stratégie 2: Fallback vers l'ancien système
    if (this.config.enableFallback) {
      try {
        console.log('[HybridService] Fallback vers le service original');
        const episodes = await animeSamaService.getLatestEpisodes();
        console.log(`[HybridService FALLBACK] ${episodes.length} épisodes récupérés`);
        return episodes;
      } catch (error) {
        console.error('[HybridService] Échec du fallback pour épisodes:', error);
        throw new Error('Aucune source de données disponible pour les épisodes');
      }
    }

    throw new Error('Toutes les sources de données sont indisponibles');
  }

  async getPopularAnimes(): Promise<Anime[]> {
    // Stratégie 1: Essayer le serveur API d'abord
    if (this.config.preferApiServer) {
      const apiAvailable = await this.checkApiServerHealth();
      
      if (apiAvailable) {
        try {
          console.log('[HybridService] Utilisation du serveur API pour les animés');
          const animes = await apiService.getPopularAnimes();
          
          if (animes && animes.length > 0) {
            console.log(`[HybridService API SUCCESS] ${animes.length} animés récupérés`);
            return animes;
          }
        } catch (error) {
          console.warn('[HybridService] Erreur serveur API pour animés:', error);
          this.isApiServerAvailable = false;
        }
      }
    }

    // Stratégie 2: Fallback vers l'ancien système
    if (this.config.enableFallback) {
      try {
        console.log('[HybridService] Fallback vers le service original');
        const animes = await animeSamaService.getPopularAnimes();
        console.log(`[HybridService FALLBACK] ${animes.length} animés récupérés`);
        return animes;
      } catch (error) {
        console.error('[HybridService] Échec du fallback pour animés:', error);
        throw new Error('Aucune source de données disponible pour les animés');
      }
    }

    throw new Error('Toutes les sources de données sont indisponibles');
  }

  async getMobileHome(): Promise<{ latestEpisodes: Episode[], popularAnimes: Anime[] }> {
    // Essayer d'abord l'endpoint optimisé /api/v1/mobile/home
    if (this.config.preferApiServer) {
      const apiAvailable = await this.checkApiServerHealth();
      
      if (apiAvailable) {
        try {
          console.log('[HybridService] Utilisation de l\'endpoint mobile/home optimisé');
          const homeData = await apiService.getMobileHome();
          
          if (homeData.latest_episodes.length > 0 || homeData.popular_animes.length > 0) {
            console.log(`[HybridService API SUCCESS] Home data: ${homeData.latest_episodes.length} épisodes, ${homeData.popular_animes.length} animés`);
            return {
              latestEpisodes: homeData.latest_episodes,
              popularAnimes: homeData.popular_animes
            };
          }
        } catch (error) {
          console.warn('[HybridService] Erreur endpoint mobile/home:', error);
          this.isApiServerAvailable = false;
        }
      }
    }

    // Fallback vers les endpoints séparés
    console.log('[HybridService] Fallback vers endpoints séparés');
    const [latestEpisodes, popularAnimes] = await Promise.all([
      this.getLatestEpisodes(),
      this.getPopularAnimes()
    ]);

    return { latestEpisodes, popularAnimes };
  }

  async forceRefresh(): Promise<{ latestEpisodes: Episode[], popularAnimes: Anime[] }> {
    const apiAvailable = await this.checkApiServerHealth();
    
    if (apiAvailable && this.config.preferApiServer) {
      try {
        console.log('[HybridService] Force refresh via serveur API');
        // Utiliser l'endpoint mobile/home pour un refresh optimisé
        return await this.getMobileHome();
      } catch (error) {
        console.warn('[HybridService] Erreur force refresh API:', error);
      }
    }

    if (this.config.enableFallback) {
      try {
        console.log('[HybridService] Force refresh via service original');
        return await animeSamaService.forceRefresh();
      } catch (error) {
        console.error('[HybridService] Erreur force refresh fallback:', error);
        throw error;
      }
    }

    throw new Error('Force refresh impossible: aucune source disponible');
  }

  // Méthodes de configuration
  setPreferApiServer(prefer: boolean): void {
    this.config.preferApiServer = prefer;
    console.log(`[HybridService] Préférence serveur API: ${prefer}`);
  }

  setApiServerUrl(url: string): void {
    apiService.setBaseUrl(url);
  }

  setEnableFallback(enable: boolean): void {
    this.config.enableFallback = enable;
    console.log(`[HybridService] Fallback activé: ${enable}`);
  }

  // Méthodes de diagnostic
  async getServiceStatus(): Promise<{
    apiServer: boolean;
    fallback: boolean;
    currentSource: 'api' | 'fallback' | 'none';
  }> {
    const apiAvailable = await this.checkApiServerHealth();
    
    let currentSource: 'api' | 'fallback' | 'none' = 'none';
    if (apiAvailable && this.config.preferApiServer) {
      currentSource = 'api';
    } else if (this.config.enableFallback) {
      currentSource = 'fallback';
    }

    return {
      apiServer: apiAvailable,
      fallback: this.config.enableFallback,
      currentSource
    };
  }

  // Méthodes déléguées vers l'ancien service pour compatibilité
  async hasCompleteHomeCache(): Promise<boolean> {
    return animeSamaService.hasCompleteHomeCache();
  }

  getCacheAge() {
    return animeSamaService.getCacheAge();
  }

  getCacheStats() {
    return animeSamaService.getCacheStats?.() || { memoryEntries: 0 };
  }

  async clearAllCache(): Promise<void> {
    // Vider seulement le cache local car l'ApiService n'a pas de méthode clearCache
    try {
      await animeSamaService.clearAllCache();
    } catch (error) {
      console.warn('[HybridService] Erreur vidage cache local:', error);
    }
  }

  // Méthodes spécifiques au serveur API
  async getApiCacheStats(): Promise<any> {
    // L'ApiService n'a pas de méthode getCacheStats, retourner un objet vide
    console.log('[HybridService] getCacheStats non disponible dans ApiService');
    return {};
  }
}

export default new HybridScrapingService(); 