import { Episode, Anime } from '../types/anime';
import { API_ADDRESS } from '@env';

interface ScrapingApiConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  count?: number;
  timestamp: string;
  error?: string;
  details?: string;
}

class ScrapingApiService {
  private config: ScrapingApiConfig;

  constructor() {
    // Utiliser la variable d'environnement du fichier .env
    const apiAddress = API_ADDRESS || 'http://localhost:8001';
    
    this.config = {
      baseUrl: `${apiAddress}`, // API principale AnimeVisionAPI
      timeout: 15000, // 15 secondes
      retryAttempts: 3,
      retryDelay: 1000, // 1 seconde
    };
    
    console.log(`[ScrapingApiService] Utilisation de l'API: ${this.config.baseUrl}`);
    
    if (!API_ADDRESS) {
      console.warn('[ScrapingApiService] Variable API_ADDRESS non définie dans .env, utilisation du fallback localhost:8001');
    }
  }

  private async fetchWithRetry<T>(
    endpoint: string,
    attempt: number = 1
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    try {
      console.log(`[ScrapingAPI] Requête ${endpoint} (tentative ${attempt})`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Erreur API inconnue');
      }
      
      console.log(`[ScrapingAPI SUCCESS] ${endpoint} - ${data.count || 'N/A'} éléments`);
      return data;
      
    } catch (error: any) {
      console.error(`[ScrapingAPI ERROR] ${endpoint} (tentative ${attempt}):`, error.message);
      
      // Retry logic
      if (attempt < this.config.retryAttempts && 
          (error.name === 'AbortError' || error.message.includes('fetch'))) {
        console.log(`[ScrapingAPI] Nouvelle tentative dans ${this.config.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        return this.fetchWithRetry<T>(endpoint, attempt + 1);
      }
      
      throw error;
    }
  }

  async getLatestEpisodes(): Promise<Episode[]> {
    try {
      const response = await this.fetchWithRetry<Episode[]>('/episodes/latest');
      return response.data || [];
    } catch (error: any) {
      console.error('[ScrapingAPI] Erreur récupération épisodes:', error);
      throw new Error(`Échec de récupération des derniers épisodes: ${error.message}`);
    }
  }

  async getPopularAnimes(): Promise<Anime[]> {
    try {
      const response = await this.fetchWithRetry<Anime[]>('/animes/popular');
      return response.data || [];
    } catch (error: any) {
      console.error('[ScrapingAPI] Erreur récupération animés:', error);
      throw new Error(`Échec de récupération des animés populaires: ${error.message}`);
    }
  }

  async clearCache(): Promise<void> {
    try {
      await this.fetchWithRetry('/cache/clear');
      console.log('[ScrapingAPI] Cache serveur vidé avec succès');
    } catch (error: any) {
      console.error('[ScrapingAPI] Erreur vidage cache:', error);
      throw new Error(`Échec du vidage du cache: ${error.message}`);
    }
  }

  async getCacheStats(): Promise<any> {
    try {
      const response = await this.fetchWithRetry('/cache/stats');
      return response.data || {};
    } catch (error: any) {
      console.error('[ScrapingAPI] Erreur stats cache:', error);
      return {};
    }
  }

  async getHealthStatus(): Promise<any> {
    try {
      const response = await this.fetchWithRetry('/health');
      return response;
    } catch (error: any) {
      console.error('[ScrapingAPI] Erreur health check:', error);
      throw new Error(`Serveur API inaccessible: ${error.message}`);
    }
  }

  // Configuration dynamique de l'URL pour le déploiement
  setBaseUrl(newBaseUrl: string): void {
    this.config.baseUrl = newBaseUrl;
    console.log(`[ScrapingAPI] URL mise à jour: ${newBaseUrl}`);
  }

  // Vérification de connectivité
  async testConnection(): Promise<boolean> {
    try {
      await this.getHealthStatus();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Méthode de fallback (en cas de panne du serveur)
  async forceRefresh(): Promise<{ latestEpisodes: Episode[], popularAnimes: Anime[] }> {
    try {
      // Vider le cache du serveur d'abord
      await this.clearCache();
      
      // Récupérer les nouvelles données
      const [latestEpisodes, popularAnimes] = await Promise.all([
        this.getLatestEpisodes(),
        this.getPopularAnimes()
      ]);
      
      return { latestEpisodes, popularAnimes };
      
    } catch (error: any) {
      console.error('[ScrapingAPI] Erreur force refresh:', error);
      throw new Error(`Échec du refresh forcé: ${error.message}`);
    }
  }
}

export default new ScrapingApiService(); 