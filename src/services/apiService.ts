import { Episode, Anime, AnimeStatus, VideoQuality } from '../types/anime';
import { API_ADDRESS } from '@env';

interface ApiEpisode {
  id: number;
  anime_id: number;
  anime_titre: string;
  anime_image?: string;
  numero_episode: number;
  titre_episode: string;
  description?: string;
  duree: number;
  thumbnail_kitsu?: string;
  date_sortie: string;
  langue: string;
  has_streaming: boolean;
  url_streaming?: string[];
  qualites_disponibles?: string[];
}

interface ApiAnime {
  id: number;
  titre: string;
  titre_alternatif?: string;
  synopsis: string;
  genres?: string[] | null;
  studio?: string;
  annee_sortie: number;
  statut: string;
  image_couverture?: string;
  poster_kitsu?: string;
  note_kitsu?: number;
  note_moyenne?: number;
  nombre_episodes_total?: number;
}

interface PaginatedAnimeResponse {
  success: boolean;
  data: ApiAnime[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_items: number;
    items_per_page: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

interface AnimeStatsResponse {
  success: boolean;
  stats: {
    total_animes: number;
    total_pages: number;
    items_per_page: number;
    animes_with_rating: number;
    animes_current_year: number;
    status_distribution: {
      en_cours: number;
      termine: number;
      a_venir: number;
    };
  };
  pagination_info: {
    recommended_limit: number;
    max_limit: number;
    total_pages_with_default: number;
  };
}

class ApiService {
  private baseUrl: string;

  constructor() {
    // Utiliser la variable d'environnement du fichier .env
    this.baseUrl = API_ADDRESS || 'https://formally-liberal-drum.ngrok-free.app';
    console.log(`[ApiService] Utilisation de l'API: ${this.baseUrl}`);
    
    if (!API_ADDRESS) {
      console.warn('[ApiService] Variable API_ADDRESS non définie dans .env, utilisation du fallback localhost:8001');
    }
  }

  private async fetchWithErrorHandling<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      console.log(`[ApiService] Requête: ${endpoint}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          // Headers pour contourner les restrictions de tunnel
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Referer': this.baseUrl,
          // Header ngrok pour éviter le warning
          'ngrok-skip-browser-warning': 'true',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[ApiService SUCCESS] ${endpoint} - ${Array.isArray(data) ? data.length : 'N/A'} éléments`);
      return data;
      
    } catch (error: any) {
      console.error(`[ApiService ERROR] ${endpoint}:`, error.message);
      throw new Error(`Erreur API ${endpoint}: ${error.message}`);
    }
  }

  private mapApiEpisodeToEpisode(apiEpisode: any, animeId?: string): Episode {
    const thumbnail = apiEpisode.thumbnail_kitsu || apiEpisode.anime_image || '';
    console.log(`[Episode ${apiEpisode.id}] Thumbnail: ${thumbnail}`);
    
    return {
      id: apiEpisode.id.toString(),
      animeId: animeId || apiEpisode.anime_id?.toString() || apiEpisode.id.toString(),
      animeTitle: apiEpisode.anime_titre || '',
      number: apiEpisode.numero_episode,
      title: apiEpisode.titre_episode || `Episode ${apiEpisode.numero_episode}`,
      thumbnail: thumbnail,
      duration: (apiEpisode.duree || 24) * 60, // Convertir minutes en secondes
      watchProgress: 0,
      isWatched: false,
      downloadStatus: 'not_downloaded' as any,
      streamingUrls: Array.isArray(apiEpisode.url_streaming) ? 
        apiEpisode.url_streaming.map((url: string, index: number) => ({
          quality: this.mapQualityToVideoQuality(
            (Array.isArray(apiEpisode.qualites_disponibles) ? 
              apiEpisode.qualites_disponibles[index] : null) || 'HD'
          ),
          url: url
        })) : []
    };
  }

  private mapApiAnimeToAnime(apiAnime: any): Anime {
    const thumbnail = apiAnime.poster_kitsu || apiAnime.image_couverture || '';
    console.log(`[Anime ${apiAnime.id}] Thumbnail: ${thumbnail}`);
    
    return {
      id: apiAnime.id.toString(),
      title: apiAnime.titre,
      originalTitle: apiAnime.titre_alternatif || apiAnime.titre,
      synopsis: apiAnime.synopsis || '',
      genres: Array.isArray(apiAnime.genres) ? apiAnime.genres : [],
      studio: apiAnime.studio || '',
      year: apiAnime.annee_sortie || 0,
      rating: apiAnime.note_kitsu || apiAnime.note_moyenne || 0,
      status: this.mapStatusToAnimeStatus(apiAnime.statut),
      thumbnail: thumbnail,
      episodeCount: apiAnime.nombre_episodes_total || 0,
      duration: 24 // Durée par défaut en minutes
    };
  }

  private mapStatusToAnimeStatus(status: string): AnimeStatus {
    switch (status) {
      case 'en_cours':
      case 'current':
        return AnimeStatus.ONGOING;
      case 'termine':
      case 'finished':
        return AnimeStatus.COMPLETED;
      case 'a_venir':
      case 'upcoming':
        return AnimeStatus.UPCOMING;
      case 'pause':
      case 'paused':
        return AnimeStatus.PAUSED;
      default:
        return AnimeStatus.ONGOING;
    }
  }

  private mapQualityToVideoQuality(quality: string): VideoQuality {
    switch (quality.toLowerCase()) {
      case 'hd':
      case '720p':
        return VideoQuality.MEDIUM;
      case 'full hd':
      case '1080p':
        return VideoQuality.HIGH;
      case '1440p':
        return VideoQuality.ULTRA;
      default:
        return VideoQuality.MEDIUM;
    }
  }

  async getLatestEpisodes(): Promise<Episode[]> {
    try {
      const response = await this.fetchWithErrorHandling<any>('/api/v1/mobile/latest-episodes?limit=20');
      
    //   console.log('[ApiService] Réponse latest-episodes:', JSON.stringify(response, null, 2));
      
      if (response && typeof response === 'object') {
        // Cas 1: Réponse avec format {success, data}
        if ('success' in response && 'data' in response && response.success && Array.isArray(response.data)) {
          return response.data.map((episode: any) => this.mapApiEpisodeToEpisode(episode, episode.anime_id?.toString()));
        }
        
        // Cas 2: Réponse directe avec un tableau
        if (Array.isArray(response)) {
          return response.map((episode: any) => this.mapApiEpisodeToEpisode(episode, episode.anime_id?.toString()));
        }
        
        // Cas 3: Autre structure - essayer de trouver un tableau
        const dataArray = response.data || response.latest_episodes || response.episodes || response;
        if (Array.isArray(dataArray)) {
          return dataArray.map((episode: any) => this.mapApiEpisodeToEpisode(episode, episode.anime_id?.toString()));
        }
      }
      
      console.warn('[ApiService] Format de réponse inattendu pour latest-episodes:', response);
      return [];
      
    } catch (error: any) {
      console.error('[ApiService] Erreur récupération épisodes:', error);
      throw error;
    }
  }

  async getPopularAnimes(): Promise<Anime[]> {
    try {
      const response = await this.fetchWithErrorHandling<any>('/api/v1/mobile/popular-animes?limit=20');
      
    //   console.log('[ApiService] Réponse popular-animes:', JSON.stringify(response, null, 2));
      
      if (response && typeof response === 'object') {
        // Cas 1: Réponse avec format {success, data}
        if ('success' in response && 'data' in response && response.success && Array.isArray(response.data)) {
          return response.data.map((anime: any) => this.mapApiAnimeToAnime(anime));
        }
        
        // Cas 2: Réponse directe avec un tableau
        if (Array.isArray(response)) {
          return response.map((anime: any) => this.mapApiAnimeToAnime(anime));
        }
        
        // Cas 3: Autre structure - essayer de trouver un tableau
        const dataArray = response.data || response.popular_animes || response.animes || response;
        if (Array.isArray(dataArray)) {
          return dataArray.map((anime: any) => this.mapApiAnimeToAnime(anime));
        }
      }
      
      console.warn('[ApiService] Format de réponse inattendu pour popular-animes:', response);
      return [];
      
    } catch (error: any) {
      console.error('[ApiService] Erreur récupération animés populaires:', error);
      // Fallback vers les derniers animés si populaires vide
      return this.getLatestAnimes();
    }
  }

  async getLatestAnimes(): Promise<Anime[]> {
    try {
      const response = await this.fetchWithErrorHandling<any>('/api/v1/anime/latest?limit=20');
      
    //   console.log('[ApiService] Réponse latest-animes:', JSON.stringify(response, null, 2));
      
      if (response && typeof response === 'object') {
        // Cas 1: Réponse avec format {success, data}
        if ('success' in response && 'data' in response && response.success && Array.isArray(response.data)) {
          return response.data.map((anime: any) => this.mapApiAnimeToAnime(anime));
        }
        
        // Cas 2: Réponse directe avec un tableau
        if (Array.isArray(response)) {
          return response.map((anime: any) => this.mapApiAnimeToAnime(anime));
        }
        
        // Cas 3: Autre structure - essayer de trouver un tableau
        const dataArray = response.data || response.latest_animes || response.animes || response;
        if (Array.isArray(dataArray)) {
          return dataArray.map((anime: any) => this.mapApiAnimeToAnime(anime));
        }
      }
      
      console.warn('[ApiService] Format de réponse inattendu pour latest-animes:', response);
      return [];
      
    } catch (error: any) {
      console.error('[ApiService] Erreur récupération derniers animés:', error);
      throw error;
    }
  }

  async searchAnimes(query: string): Promise<Anime[]> {
    try {
      const apiAnimes = await this.fetchWithErrorHandling<ApiAnime[]>(`/api/v1/anime/search?q=${encodeURIComponent(query)}`);
      return apiAnimes.map(anime => this.mapApiAnimeToAnime(anime));
    } catch (error: any) {
      console.error('[ApiService] Erreur recherche animés:', error);
      throw error;
    }
  }

  async getAnimeById(id: string): Promise<Anime> {
    try {
      const apiAnime = await this.fetchWithErrorHandling<ApiAnime>(`/api/v1/anime/${id}`);
      return this.mapApiAnimeToAnime(apiAnime);
    } catch (error: any) {
      console.error('[ApiService] Erreur récupération animé:', error);
      throw error;
    }
  }

  async getEpisodeById(id: string): Promise<Episode> {
    try {
      const apiEpisode = await this.fetchWithErrorHandling<ApiEpisode>(`/api/v1/episode/${id}`);
      return this.mapApiEpisodeToEpisode(apiEpisode);
    } catch (error: any) {
      console.error('[ApiService] Erreur récupération épisode:', error);
      throw error;
    }
  }

  async getHealthStatus(): Promise<{ status: string }> {
    try {
      return await this.fetchWithErrorHandling<{ status: string }>('/health');
    } catch (error: any) {
      console.error('[ApiService] Erreur health check:', error);
      throw error;
    }
  }

  async getMobileHome(): Promise<{latest_episodes: Episode[], popular_animes: Anime[]}> {
    try {
      const response = await this.fetchWithErrorHandling<any>('/api/v1/mobile/home');
      
    //   console.log('[ApiService] Réponse mobile/home:', JSON.stringify(response, null, 2));
      
      if (response && typeof response === 'object') {
        let latestEpisodes: Episode[] = [];
        let popularAnimes: Anime[] = [];
        
        // Cas 1: Réponse avec format {success, data: {latest_episodes, popular_animes}}
        if ('success' in response && 'data' in response && response.success && response.data) {
          const data = response.data;
          if (Array.isArray(data.latest_episodes)) {
            latestEpisodes = data.latest_episodes.map((episode: any) => this.mapApiEpisodeToEpisode(episode, episode.anime_id?.toString()));
          }
          if (Array.isArray(data.popular_animes)) {
            popularAnimes = data.popular_animes.map((anime: any) => this.mapApiAnimeToAnime(anime));
          }
        }
        // Cas 2: Réponse directe avec les propriétés
        else if ('latest_episodes' in response || 'popular_animes' in response) {
          if (Array.isArray(response.latest_episodes)) {
            latestEpisodes = response.latest_episodes.map((episode: any) => this.mapApiEpisodeToEpisode(episode, episode.anime_id?.toString()));
          }
          if (Array.isArray(response.popular_animes)) {
            popularAnimes = response.popular_animes.map((anime: any) => this.mapApiAnimeToAnime(anime));
          }
        }
        
        return { latest_episodes: latestEpisodes, popular_animes: popularAnimes };
      }
      
      console.warn('[ApiService] Format de réponse inattendu pour mobile/home:', response);
      throw new Error('Format de réponse invalide');
    } catch (error: any) {
      console.error('[ApiService] Erreur récupération page d\'accueil:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getHealthStatus();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Méthodes pour VideoPlayer
  async getAnimeEpisodes(animeId: string): Promise<Episode[]> {
    try {
      const response = await this.fetchWithErrorHandling<any>(`/api/v1/mobile/anime/${animeId}/episodes`);
      
    //   console.log(`[ApiService] Réponse episodes pour anime ${animeId}:`, JSON.stringify(response, null, 2));
      
      if (response && typeof response === 'object') {
        // Cas 1: Réponse avec format {success, data}
        if ('success' in response && 'data' in response && response.success && Array.isArray(response.data)) {
          return response.data.map((episode: any) => this.mapApiEpisodeToEpisode(episode, animeId));
        }
        
        // Cas 2: Réponse directe avec un tableau
        if (Array.isArray(response)) {
          return response.map((episode: any) => this.mapApiEpisodeToEpisode(episode, animeId));
        }
        
        // Cas 3: Autre structure - essayer de trouver un tableau
        const dataArray = response.data || response.episodes || response;
        if (Array.isArray(dataArray)) {
          return dataArray.map((episode: any) => this.mapApiEpisodeToEpisode(episode, animeId));
        }
      }
      
      console.warn(`[ApiService] Format de réponse inattendu pour episodes anime ${animeId}:`, response);
      return [];
      
    } catch (error: any) {
      console.error(`[ApiService] Erreur récupération épisodes anime ${animeId}:`, error);
      throw error;
    }
  }

  async getEpisodeEmbedUrls(episodeId: string): Promise<string[]> {
    try {
      const response = await this.fetchWithErrorHandling<any>(`/api/v1/mobile/episode/${episodeId}/streaming/embeds`);
      
      if (response && typeof response === 'object') {
        if ('success' in response && 'embed_urls' in response && response.success && Array.isArray(response.embed_urls)) {
          return response.embed_urls;
        }
      }
      
      console.warn(`[ApiService] Endpoint embeds non disponible pour épisode ${episodeId}, fallback vers streaming`);
      return [];
      
    } catch (error: any) {
      console.log(`[ApiService] Fallback vers endpoint streaming pour épisode ${episodeId}`);
      return [];
    }
  }

  async getEpisodeStreamingUrls(episodeId: string): Promise<Array<{quality: string, url: string}>> {
    try {
      const response = await this.fetchWithErrorHandling<any>(`/api/v1/mobile/episode/${episodeId}/streaming`);
      
    //   console.log(`[ApiService] Réponse streaming pour épisode ${episodeId}:`, JSON.stringify(response, null, 2));
      
      if (response && typeof response === 'object') {
        // Cas 1: Réponse avec format {success, data: {fresh_hls_urls}}
        if ('success' in response && 'data' in response && response.success && response.data) {
          const data = response.data;
          if (Array.isArray(data.fresh_hls_urls)) {
            return data.fresh_hls_urls.map((hlsData: any) => ({
              quality: hlsData.quality || 'HD',
              url: hlsData.url
            }));
          }
          // Fallback vers hls_url simple
          if (data.hls_url) {
            return [{
              quality: 'HD',
              url: data.hls_url
            }];
          }
        }
        
        // Cas 2: URLs directes dans streamingUrls
        if (Array.isArray(response.streamingUrls)) {
          return response.streamingUrls;
        }
        
        // Cas 3: URL simple
        if (response.hls_url) {
          return [{
            quality: 'HD',
            url: response.hls_url
          }];
        }
      }
      
      console.warn(`[ApiService] Aucune URL de streaming trouvée pour épisode ${episodeId}:`, response);
      return [];
      
    } catch (error: any) {
      console.error(`[ApiService] Erreur récupération streaming épisode ${episodeId}:`, error);
      throw error;
    }
  }

  async hasStreamingUrls(episodeId: string): Promise<boolean> {
    try {
      const urls = await this.getEpisodeStreamingUrls(episodeId);
      return urls.length > 0;
    } catch (error: any) {
      console.error(`[ApiService] Erreur vérification streaming épisode ${episodeId}:`, error);
      return false;
    }
  }

  // Récupérer les détails d'un anime
  async getAnimeDetails(animeId: string): Promise<Anime> {
    try {
      const response = await this.fetchWithErrorHandling<any>(`/api/v1/anime/${animeId}`);
      
    //   console.log(`[ApiService] Réponse anime ${animeId}:`, JSON.stringify(response, null, 2));
      
      if (response && typeof response === 'object') {
        // Cas 1: Réponse avec format {success, data}
        if ('success' in response && 'data' in response && response.success) {
          return this.mapApiAnimeToAnime(response.data);
        }
        
        // Cas 2: Réponse directe
        if ('id' in response || 'anime_id' in response) {
          return this.mapApiAnimeToAnime(response);
        }
      }
      
      throw new Error(`Format de réponse anime inattendu: ${JSON.stringify(response)}`);
    } catch (error) {
      console.error(`[ApiService] Erreur récupération animé ${animeId}:`, error);
      throw error;
    }
  }

  // Configuration dynamique de l'URL
  setBaseUrl(newBaseUrl: string): void {
    this.baseUrl = newBaseUrl;
    console.log(`[ApiService] URL de base mise à jour: ${this.baseUrl}`);
  }

  // Méthode utilitaire pour rechercher des animes avec des filtres spécifiques
  async searchAnimesByFilters(filters: {
    query?: string;
    genre?: string;
    year?: number;
    status?: 'en_cours' | 'termine' | 'a_venir';
    sortBy?: 'titre' | 'note_kitsu' | 'annee_sortie' | 'date_ajout';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{ 
    animes: Anime[], 
    hasMore: boolean, 
    totalPages?: number, 
    totalItems?: number,
    currentPage?: number
  }> {
    return this.getAnimeList(
      filters.page || 1,
      filters.limit || 20,
      {
        search: filters.query,
        genre: filters.genre,
        statut: filters.status,
        annee: filters.year,
        sort_by: filters.sortBy,
        sort_order: filters.sortOrder
      }
    );
  }

  // Méthode pour récupérer une liste paginée d'animés avec filtres avancés
  async getAnimeList(
    page: number = 1, 
    limit: number = 20,
    options?: {
      search?: string;
      genre?: string;
      statut?: string;
      annee?: number;
      sort_by?: 'titre' | 'note_kitsu' | 'annee_sortie' | 'date_ajout';
      sort_order?: 'asc' | 'desc';
    }
  ): Promise<{ 
    animes: Anime[], 
    hasMore: boolean, 
    totalPages?: number, 
    totalItems?: number,
    currentPage?: number
  }> {
    try {
      // Construire les paramètres de la requête
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (options?.search) params.append('search', options.search);
      if (options?.genre) params.append('genre', options.genre);
      if (options?.statut) params.append('statut', options.statut);
      if (options?.annee) params.append('annee', options.annee.toString());
      if (options?.sort_by) params.append('sort_by', options.sort_by);
      if (options?.sort_order) params.append('sort_order', options.sort_order);

      const response = await this.fetchWithErrorHandling<any>(`/api/v1/mobile/animes?${params.toString()}`);
      
      // Nouveau format avec pagination
      if (response && response.success && Array.isArray(response.data)) {
        console.log(`[ApiService] getAnimeList page ${page}: ${response.data.length} animés trouvés`);
        return {
          animes: response.data.map((anime: any) => this.mapApiAnimeToAnime(anime)),
          hasMore: response.pagination?.has_next || false,
          totalPages: response.pagination?.total_pages,
          totalItems: response.pagination?.total_items,
          currentPage: response.pagination?.current_page || page
        };
      }
      
      // Format ancien (fallback)
      if (response && Array.isArray(response)) {
        console.log(`[ApiService] getAnimeList format ancien - ${response.length} animés`);
        return {
          animes: response.map((anime: any) => this.mapApiAnimeToAnime(anime)),
          hasMore: response.length === limit
        };
      }
      
      console.warn('[ApiService] Format de réponse inattendu pour anime list:', response);
      throw new Error('Format de réponse invalide');
      
    } catch (error: any) {
      console.error('[ApiService] Erreur récupération liste d\'animés:', error);
      
      // Fallback vers les animes populaires en cas d'erreur
      console.log('[ApiService] Tentative de fallback vers popular animes');
      try {
        const fallbackResponse = await this.getPopularAnimes();
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        return {
          animes: fallbackResponse.slice(startIndex, endIndex),
          hasMore: fallbackResponse.length > endIndex
        };
      } catch (fallbackError) {
        console.error('[ApiService] Erreur fallback popular animes:', fallbackError);
        throw error;
      }
    }
  }

  // Méthode pour récupérer les statistiques des animes
  async getAnimeStats(): Promise<{
    total_animes: number;
    total_pages: number;
    items_per_page: number;
    animes_with_rating: number;
    animes_current_year: number;
    status_distribution: {
      en_cours: number;
      termine: number;
      a_venir: number;
    };
    pagination_info: {
      recommended_limit: number;
      max_limit: number;
      total_pages_with_default: number;
    };
  } | null> {
    try {
      const response = await this.fetchWithErrorHandling<any>('/api/v1/mobile/animes/stats');
      
      if (response && response.success && response.stats) {
        console.log('[ApiService] Statistiques animés récupérées:', response.stats);
        return {
          ...response.stats,
          pagination_info: response.pagination_info || {
            recommended_limit: 20,
            max_limit: 100,
            total_pages_with_default: Math.ceil(response.stats.total_animes / 20)
          }
        };
      }
      
      console.warn('[ApiService] Format de réponse inattendu pour anime stats:', response);
      return null;
      
    } catch (error: any) {
      console.error('[ApiService] Erreur récupération statistiques animés:', error);
      return null;
    }
  }
}

export default new ApiService();