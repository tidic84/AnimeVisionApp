import AsyncStorage from '@react-native-async-storage/async-storage';
import { Anime, Episode } from '../types/anime';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number; // en millisecondes
}

interface CacheConfig {
  latestEpisodes: number; // 10 minutes
  popularAnimes: number;  // 30 minutes
  animeDetails: number;   // 2 heures
  animeEpisodes: number;  // 1 heure
  searchResults: number;  // 5 minutes
}

class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  
  // Configuration des durées de cache
  private config: CacheConfig = {
    latestEpisodes: 30 * 60 * 1000,    // 30 minutes (augmenté de 10 min)
    popularAnimes: 60 * 60 * 1000,     // 1 heure (augmenté de 30 min)
    animeDetails: 4 * 60 * 60 * 1000,  // 4 heures (augmenté de 2 heures)
    animeEpisodes: 2 * 60 * 60 * 1000, // 2 heures (augmenté de 1 heure)
    searchResults: 15 * 60 * 1000,     // 15 minutes (augmenté de 5 min)
  };

  // Préfixes pour les clés de cache
  private readonly KEYS = {
    LATEST_EPISODES: 'cache_latest_episodes',
    POPULAR_ANIMES: 'cache_popular_animes',
    ANIME_DETAILS: 'cache_anime_details_',
    ANIME_EPISODES: 'cache_anime_episodes_',
    SEARCH_RESULTS: 'cache_search_',
    METADATA: 'cache_metadata',
  } as const;

  /**
   * Initialise le cache depuis AsyncStorage au démarrage
   */
  async initialize(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith('cache_'));
      
      if (cacheKeys.length === 0) return;

      const items = await AsyncStorage.multiGet(cacheKeys);
      
      for (const [key, value] of items) {
        if (value) {
          try {
            const entry: CacheEntry<any> = JSON.parse(value);
            
            // Vérifier si l'entrée n'a pas expiré
            if (!this.isExpired(entry)) {
              this.cache.set(key, entry);
            } else {
              // Supprimer les entrées expirées d'AsyncStorage
              await AsyncStorage.removeItem(key);
            }
          } catch (parseError) {
            console.warn(`Erreur lors du parsing du cache ${key}:`, parseError);
            await AsyncStorage.removeItem(key);
          }
        }
      }

      console.log(`[Cache] ${this.cache.size} entrées chargées depuis AsyncStorage`);
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du cache:', error);
    }
  }

  /**
   * Met en cache les derniers épisodes
   */
  async setLatestEpisodes(episodes: Episode[]): Promise<void> {
    const entry: CacheEntry<Episode[]> = {
      data: episodes,
      timestamp: Date.now(),
      expiresIn: this.config.latestEpisodes,
    };

    this.cache.set(this.KEYS.LATEST_EPISODES, entry);
    await this.persistToStorage(this.KEYS.LATEST_EPISODES, entry);
  }

  /**
   * Récupère les derniers épisodes du cache
   */
  async getLatestEpisodes(): Promise<Episode[] | null> {
    return this.get<Episode[]>(this.KEYS.LATEST_EPISODES);
  }

  /**
   * Met en cache les animés populaires
   */
  async setPopularAnimes(animes: Anime[]): Promise<void> {
    const entry: CacheEntry<Anime[]> = {
      data: animes,
      timestamp: Date.now(),
      expiresIn: this.config.popularAnimes,
    };

    this.cache.set(this.KEYS.POPULAR_ANIMES, entry);
    await this.persistToStorage(this.KEYS.POPULAR_ANIMES, entry);
  }

  /**
   * Récupère les animés populaires du cache
   */
  async getPopularAnimes(): Promise<Anime[] | null> {
    return this.get<Anime[]>(this.KEYS.POPULAR_ANIMES);
  }

  /**
   * Met en cache les détails d'un animé
   */
  async setAnimeDetails(animeId: string, anime: Anime): Promise<void> {
    const key = this.KEYS.ANIME_DETAILS + animeId;
    const entry: CacheEntry<Anime> = {
      data: anime,
      timestamp: Date.now(),
      expiresIn: this.config.animeDetails,
    };

    this.cache.set(key, entry);
    await this.persistToStorage(key, entry);
  }

  /**
   * Récupère les détails d'un animé du cache
   */
  async getAnimeDetails(animeId: string): Promise<Anime | null> {
    const key = this.KEYS.ANIME_DETAILS + animeId;
    return this.get<Anime>(key);
  }

  /**
   * Met en cache les épisodes d'un animé
   */
  async setAnimeEpisodes(animeId: string, episodes: Episode[]): Promise<void> {
    const key = this.KEYS.ANIME_EPISODES + animeId;
    const entry: CacheEntry<Episode[]> = {
      data: episodes,
      timestamp: Date.now(),
      expiresIn: this.config.animeEpisodes,
    };

    this.cache.set(key, entry);
    await this.persistToStorage(key, entry);
  }

  /**
   * Récupère les épisodes d'un animé du cache
   */
  async getAnimeEpisodes(animeId: string): Promise<Episode[] | null> {
    const key = this.KEYS.ANIME_EPISODES + animeId;
    return this.get<Episode[]>(key);
  }

  /**
   * Met en cache les résultats de recherche
   */
  async setSearchResults(query: string, results: Anime[]): Promise<void> {
    const key = this.KEYS.SEARCH_RESULTS + this.sanitizeKey(query);
    const entry: CacheEntry<Anime[]> = {
      data: results,
      timestamp: Date.now(),
      expiresIn: this.config.searchResults,
    };

    this.cache.set(key, entry);
    await this.persistToStorage(key, entry);
  }

  /**
   * Récupère les résultats de recherche du cache
   */
  async getSearchResults(query: string): Promise<Anime[] | null> {
    const key = this.KEYS.SEARCH_RESULTS + this.sanitizeKey(query);
    return this.get<Anime[]>(key);
  }

  /**
   * Vérifie si on a des données en cache pour le pull-to-refresh
   */
  async hasValidCache(): Promise<{
    latestEpisodes: boolean;
    popularAnimes: boolean;
  }> {
    const latestEpisodes = await this.getLatestEpisodes();
    const popularAnimes = await this.getPopularAnimes();

    return {
      latestEpisodes: latestEpisodes !== null && latestEpisodes.length > 0,
      popularAnimes: popularAnimes !== null && popularAnimes.length > 0,
    };
  }

  /**
   * Vérifie si le cache de la page d'accueil est complet et valide
   */
  async hasCompleteHomeCache(): Promise<boolean> {
    const { latestEpisodes, popularAnimes } = await this.hasValidCache();
    return latestEpisodes && popularAnimes;
  }

  /**
   * Retourne l'âge des données de cache en minutes
   */
  getCacheAge(): {
    latestEpisodes: number | null;
    popularAnimes: number | null;
  } {
    const now = Date.now();
    
    const episodesEntry = this.cache.get(this.KEYS.LATEST_EPISODES);
    const animesEntry = this.cache.get(this.KEYS.POPULAR_ANIMES);
    
    return {
      latestEpisodes: episodesEntry ? Math.floor((now - episodesEntry.timestamp) / (60 * 1000)) : null,
      popularAnimes: animesEntry ? Math.floor((now - animesEntry.timestamp) / (60 * 1000)) : null,
    };
  }

  /**
   * Nettoie le cache expiré
   */
  async cleanup(): Promise<void> {
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
        this.cache.delete(key);
      }
    }

    if (expiredKeys.length > 0) {
      await AsyncStorage.multiRemove(expiredKeys);
      console.log(`[Cache] ${expiredKeys.length} entrées expirées supprimées`);
    }
  }

  /**
   * Vide tout le cache
   */
  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith('cache_'));
      
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
      
      this.cache.clear();
      console.log('[Cache] Cache entièrement vidé');
    } catch (error) {
      console.error('Erreur lors du vidage du cache:', error);
    }
  }

  /**
   * Vide complètement tout le cache (mémoire + stockage)
   */
  async clearAll(): Promise<void> {
    try {
      // Vider le cache mémoire
      this.cache.clear();
      
      // Vider le cache persistant
      await AsyncStorage.clear();
      
      console.log('[Cache] Cache complet vidé (mémoire + stockage)');
    } catch (error) {
      console.error('Erreur lors du vidage complet du cache:', error);
    }
  }

  /**
   * Vide le cache et force le rechargement des données
   */
  async forceReload(): Promise<void> {
    await this.clearAll();
    console.log('[Cache] Rechargement forcé - cache vidé');
  }

  /**
   * Statistiques du cache
   */
  getStats(): {
    memoryEntries: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let totalSize = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const entry of this.cache.values()) {
      totalSize += JSON.stringify(entry).length;
      
      if (oldestEntry === null || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      
      if (newestEntry === null || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }

    return {
      memoryEntries: this.cache.size,
      totalSize,
      oldestEntry,
      newestEntry,
    };
  }

  // Méthodes privées
  private async get<T>(key: string): Promise<T | null> {
    // Vérifier d'abord en mémoire
    const memoryEntry = this.cache.get(key);
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      return memoryEntry.data as T;
    }

    // Si expiré en mémoire, supprimer
    if (memoryEntry && this.isExpired(memoryEntry)) {
      this.cache.delete(key);
      await AsyncStorage.removeItem(key);
      return null;
    }

    // Vérifier dans AsyncStorage
    try {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) return null;

      const entry: CacheEntry<T> = JSON.parse(stored);
      
      if (this.isExpired(entry)) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      // Remettre en mémoire
      this.cache.set(key, entry);
      return entry.data;
    } catch (error) {
      console.warn(`Erreur lors de la lecture du cache ${key}:`, error);
      return null;
    }
  }

  private async persistToStorage<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.warn(`Erreur lors de la persistance du cache ${key}:`, error);
    }
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.expiresIn;
  }

  private sanitizeKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50);
  }
}

export default new CacheService(); 