import { Episode, Anime, AnimeStatus, VideoQuality, Season, StreamingServer, ApiResponse, ApiError } from '../types/anime';
import { API_ADDRESS } from '@env';

class ApiService {
  private baseUrl: string;

  constructor() {
    // Utiliser la nouvelle URL de l'API
    this.baseUrl = API_ADDRESS || 'https://formally-liberal-drum.ngrok-free.app';
    console.log(`[ApiService] Utilisation de l'API: ${this.baseUrl}`);
    
    if (!API_ADDRESS) {
      console.warn('[ApiService] Variable API_ADDRESS non définie dans .env, utilisation du fallback');
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
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Referer': this.baseUrl,
          'ngrok-skip-browser-warning': 'true',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Vérifier si c'est une erreur de l'API
      if (data.error) {
        const error = data as ApiError;
        throw new Error(error.message);
      }
      
      console.log(`[ApiService SUCCESS] ${endpoint} - Réponse reçue`);
      return data;
      
    } catch (error: any) {
      console.error(`[ApiService ERROR] ${endpoint}:`, error.message);
      throw new Error(`Erreur API ${endpoint}: ${error.message}`);
    }
  }

  private mapApiAnimeToAnime(apiAnime: any): Anime {
    return {
      id: apiAnime.id.toString(),
      title: apiAnime.titre,
      originalTitle: apiAnime.titre_alt || apiAnime.titre,
      synopsis: apiAnime.synopsis || '',
      genres: Array.isArray(apiAnime.genres) ? apiAnime.genres : [],
      studio: apiAnime.studio || '',
      year: 0, // Pas disponible directement, à récupérer via les saisons
      rating: apiAnime.note || 0,
      status: this.mapStatusToAnimeStatus('ongoing'), // Par défaut
      thumbnail: apiAnime.poster || '',
      banner: apiAnime.banniere,
      episodeCount: apiAnime.episode_count || apiAnime.nb_episodes || 0, // Utiliser les données de l'API si disponibles
      duration: 24, // Durée par défaut en minutes
      titre_alt: apiAnime.titre_alt,
      titre_jap: apiAnime.titre_jap,
      url_anime_sama: apiAnime.url_anime_sama,
      kitsu_id: apiAnime.kitsu_id,
      anidb_id: apiAnime.anidb_id,
      date_ajout: apiAnime.date_ajout,
      date_update: apiAnime.date_update,
    };
  }

  private mapApiEpisodeToEpisode(apiEpisode: any, animeId?: string): Episode {
    const streamingUrls = this.convertStreamingServersToUrls(apiEpisode.streaming_servers || []);
    
    // Déterminer l'animeId - depuis les paramètres, depuis l'épisode, ou depuis la saison
    let episodeAnimeId = animeId || 
                        apiEpisode.anime_id?.toString() || 
                        '';
    
    // Si on n'a toujours pas d'animeId mais qu'on a une saison_id, 
    // on va essayer de le récupérer plus tard si nécessaire
    if (!episodeAnimeId && apiEpisode.saison_id) {
      // Utiliser le saison_id temporairement - sera corrigé dans getSeasonEpisodes
      episodeAnimeId = `season_${apiEpisode.saison_id}`;
    }
    
    return {
      id: apiEpisode.id.toString(),
      animeId: episodeAnimeId,
      animeTitle: apiEpisode.anime_titre || '',
      number: apiEpisode.num_episode,
      title: apiEpisode.titre_episode || `Episode ${apiEpisode.num_episode}`,
      thumbnail: apiEpisode.thumbnail || apiEpisode.anime_poster || 'https://via.placeholder.com/300x400/1e293b/ffffff?text=Episode',
      duration: (apiEpisode.duree || 24) * 60, // Convertir minutes en secondes
      watchProgress: 0,
      isWatched: false,
      downloadStatus: 'not_downloaded' as any,
      streamingUrls: streamingUrls,
      saison_id: apiEpisode.saison_id?.toString(),
      titre_episode: apiEpisode.titre_episode,
      description: apiEpisode.description,
      streaming_servers: apiEpisode.streaming_servers,
      langue: apiEpisode.langue,
      date_sortie: apiEpisode.date_sortie,
      date_ajout: apiEpisode.date_ajout,
      num_saison: apiEpisode.num_saison,
      titre_saison: apiEpisode.titre_saison,
      anime_poster: apiEpisode.anime_poster,
    };
  }

  private convertStreamingServersToUrls(servers: StreamingServer[]): Array<{quality: VideoQuality, url: string}> {
    return servers.map(server => ({
      quality: this.mapQualityToVideoQuality(server.quality),
      url: server.url
    }));
  }

  private mapStatusToAnimeStatus(status: string): AnimeStatus {
    switch (status?.toLowerCase()) {
      case 'finished':
      case 'termine':
        return AnimeStatus.COMPLETED;
      case 'airing':
      case 'en_cours':
        return AnimeStatus.ONGOING;
      case 'upcoming':
      case 'a_venir':
        return AnimeStatus.UPCOMING;
      case 'paused':
      case 'pause':
        return AnimeStatus.PAUSED;
      default:
        return AnimeStatus.ONGOING;
    }
  }

  private mapQualityToVideoQuality(quality: string): VideoQuality {
    switch (quality?.toLowerCase()) {
      case 'hd':
      case '720p':
        return VideoQuality.MEDIUM;
      case 'full hd':
      case '1080p':
        return VideoQuality.HIGH;
      case 'sd':
      case '480p':
        return VideoQuality.LOW;
      case '1440p':
        return VideoQuality.ULTRA;
      default:
        return VideoQuality.MEDIUM;
    }
  }

  // Nouveaux endpoints de l'API

  async getLatestAnimes(limit: number = 20, page: number = 1): Promise<Anime[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/anime/latest?limit=${limit}&page=${page}`);
    return response.data.map(anime => this.mapApiAnimeToAnime(anime));
  }

  async getPopularAnimes(limit: number = 20, page: number = 1): Promise<Anime[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/anime/popular?limit=${limit}&page=${page}`);
    return response.data.map(anime => this.mapApiAnimeToAnime(anime));
  }

  async getTrendingAnimes(limit: number = 20, page: number = 1): Promise<Anime[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/discover/trending?limit=${limit}&page=${page}`);
    return response.data.map(anime => this.mapApiAnimeToAnime(anime));
  }

  async searchAnimes(query: string, limit: number = 20, page: number = 1): Promise<Anime[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/anime/search?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}`);
    return response.data.map(anime => this.mapApiAnimeToAnime(anime));
  }

  async searchSuggestions(query: string): Promise<string[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
    return response.data.map((item: any) => item.titre || item.suggestion || '');
  }

  async getAnimeById(id: string): Promise<Anime> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any>>(`/api/anime/${id}`);
    return this.mapApiAnimeToAnime(response.data);
  }

  async getAnimeSeasons(animeId: string): Promise<Season[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/anime/${animeId}/saisons`);
    return response.data.map(season => ({
      id: season.id.toString(),
      anime_id: season.anime_id.toString(),
      num_saison: season.num_saison,
      titre_saison: season.titre_saison,
      annee_sortie: season.annee_sortie,
      nb_episodes: season.nb_episodes,
      statut: season.statut,
      type: season.type,
      date_ajout: season.date_ajout,
      date_update: season.date_update,
    }));
  }

  async getSeasonById(seasonId: string): Promise<Season> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any>>(`/api/saison/${seasonId}`);
    return {
      id: response.data.id.toString(),
      anime_id: response.data.anime_id.toString(),
      num_saison: response.data.num_saison,
      titre_saison: response.data.titre_saison,
      annee_sortie: response.data.annee_sortie,
      nb_episodes: response.data.nb_episodes,
      statut: response.data.statut,
      type: response.data.type,
      date_ajout: response.data.date_ajout,
      date_update: response.data.date_update,
    };
  }

  async getSeasonEpisodes(seasonId: string, animeId?: string): Promise<Episode[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/saison/${seasonId}/episodes`);
    return response.data.map(episode => this.mapApiEpisodeToEpisode(episode, animeId));
  }

  async getEpisodeById(episodeId: string): Promise<Episode> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any>>(`/api/episode/${episodeId}`);
    
    // Pour un épisode individuel, nous devons récupérer l'animeId via la saison
    let animeId = '';
    if (response.data.saison_id) {
      try {
        // Récupérer les détails de la saison pour obtenir l'anime_id
        const season = await this.getSeasonById(response.data.saison_id);
        animeId = season.anime_id;
      } catch (error) {
        console.warn(`[ApiService] Impossible de récupérer l'anime_id pour la saison ${response.data.saison_id}:`, error);
      }
    }
    
    return this.mapApiEpisodeToEpisode(response.data, animeId);
  }

  async getLatestEpisodes(limit: number = 50, langue?: string): Promise<Episode[]> {
    let endpoint = `/api/episodes/latest?limit=${limit}`;
    if (langue) {
      endpoint += `&langue=${langue}`;
    }
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(endpoint);
    
    // Pour les derniers épisodes, nous avons déjà toutes les infos nécessaires dans la réponse
    return response.data.map(episode => {
      // Utiliser l'anime_id depuis la réponse s'il est disponible
      const animeId = episode.anime_id?.toString() || '';
      return this.mapApiEpisodeToEpisode(episode, animeId);
    });
  }

  async getAnimesByGenre(genre: string, limit: number = 20, page: number = 1): Promise<Anime[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/discover/by-genre/${encodeURIComponent(genre)}?limit=${limit}&page=${page}`);
    return response.data.map(anime => this.mapApiAnimeToAnime(anime));
  }

  async getRandomAnimes(limit: number = 10): Promise<Anime[]> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/discover/random?limit=${limit}`);
    return response.data.map(anime => this.mapApiAnimeToAnime(anime));
  }

  async getAvailableGenres(): Promise<string[]> {
    try {
      const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/anime/genres`);
      return response.data.map((item: any) => item.genre || item);
    } catch (error) {
      console.warn('[ApiService] Impossible de récupérer les genres, utilisation des genres par défaut');
      return ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Sci-Fi', 'Thriller'];
    }
  }

  async getAvailableLanguages(): Promise<Array<{langue: string, count: number}>> {
    const response = await this.fetchWithErrorHandling<ApiResponse<any[]>>(`/api/languages`);
    return response.data;
  }

  // Méthodes de compatibilité avec l'ancienne API

  async getAnimeEpisodes(animeId: string): Promise<Episode[]> {
    try {
      // Valider que l'animeId n'est pas vide
      if (!animeId || animeId.trim() === '') {
        console.error('[ApiService] animeId vide ou undefined dans getAnimeEpisodes');
        return [];
      }
      
      // Récupérer les saisons de l'animé
      const seasons = await this.getAnimeSeasons(animeId);
      
      // Récupérer tous les épisodes de toutes les saisons
      const allEpisodes: Episode[] = [];
      for (const season of seasons) {
        const episodes = await this.getSeasonEpisodes(season.id, animeId);
        allEpisodes.push(...episodes);
      }
      
      return allEpisodes.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error(`[ApiService] Erreur lors de la récupération des épisodes pour l'animé ${animeId}:`, error);
      return [];
    }
  }

  async getHealthStatus(): Promise<{ status: string }> {
    const response = await this.fetchWithErrorHandling<any>('/health');
    return { status: response.status === 'ok' ? 'ok' : 'error' };
  }

  async getMobileHome(): Promise<{latest_episodes: Episode[], popular_animes: Anime[]}> {
    try {
      const [latestEpisodes, popularAnimes] = await Promise.all([
        this.getLatestEpisodes(20, 'vostfr'),
        this.getPopularAnimes(20),
      ]);
      
      return {
        latest_episodes: latestEpisodes,
        popular_animes: popularAnimes,
      };
    } catch (error) {
      console.error('[ApiService] Erreur lors de la récupération des données de l\'accueil:', error);
      return {
        latest_episodes: [],
        popular_animes: [],
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getHealthStatus();
      return true;
    } catch {
      return false;
    }
  }

  setBaseUrl(newBaseUrl: string): void {
    this.baseUrl = newBaseUrl;
    console.log(`[ApiService] URL de base mise à jour: ${this.baseUrl}`);
  }

  // Méthodes obsolètes maintenues pour compatibilité
  async getEpisodeEmbedUrls(episodeId: string): Promise<string[]> {
    try {
      const episode = await this.getEpisodeById(episodeId);
      return episode.streamingUrls.map(stream => stream.url);
    } catch {
      return [];
    }
  }

  async getEpisodeStreamingUrls(episodeId: string): Promise<Array<{quality: string, url: string}>> {
    try {
      const episode = await this.getEpisodeById(episodeId);
      return episode.streamingUrls.map(stream => ({
        quality: stream.quality,
        url: stream.url
      }));
    } catch {
      return [];
    }
  }

  async hasStreamingUrls(episodeId: string): Promise<boolean> {
    try {
      const episode = await this.getEpisodeById(episodeId);
      return episode.streamingUrls.length > 0;
    } catch {
      return false;
    }
  }

  async getAnimeDetails(animeId: string): Promise<Anime> {
    return this.getAnimeById(animeId);
  }

  async searchAnimesByFilters(filters: {
    query?: string;
    genre?: string;
    year?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }): Promise<{ 
    animes: Anime[], 
    hasMore: boolean, 
    totalPages?: number, 
    totalItems?: number,
    currentPage?: number
  }> {
    try {
      let animes: Anime[] = [];
      
      if (filters.query) {
        animes = await this.searchAnimes(filters.query, filters.limit, filters.page);
      } else if (filters.genre) {
        animes = await this.getAnimesByGenre(filters.genre, filters.limit, filters.page);
      } else {
        animes = await this.getLatestAnimes(filters.limit, filters.page);
      }
      
      return {
        animes,
        hasMore: animes.length === (filters.limit || 20),
        currentPage: filters.page || 1,
      };
    } catch (error) {
      console.error('[ApiService] Erreur lors de la recherche avec filtres:', error);
      return {
        animes: [],
        hasMore: false,
      };
    }
  }

  async getAnimeList(
    page: number = 1, 
    limit: number = 20,
    options?: {
      search?: string;
      genre?: string;
      statut?: string;
      annee?: number;
      sort_by?: string;
      sort_order?: string;
    }
  ): Promise<{ 
    animes: Anime[], 
    hasMore: boolean, 
    totalPages?: number, 
    totalItems?: number,
    currentPage?: number
  }> {
    return this.searchAnimesByFilters({
      query: options?.search,
      genre: options?.genre,
      page,
      limit,
    });
  }

  async getAnimeStats(): Promise<any> {
    try {
      const response = await this.fetchWithErrorHandling<ApiResponse<any>>('/api/stats');
      return response.data;
    } catch {
      return null;
    }
  }
}

export default new ApiService();