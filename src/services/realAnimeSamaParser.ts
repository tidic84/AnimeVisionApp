import { Anime, Episode, AnimeStatus } from '../types/anime';

export interface ParsedEpisodeData {
  animeSlug: string;
  animeTitle: string;
  episodeNumber: number;
  season?: number;
  language: 'VOSTFR' | 'VF' | 'VASTFR';
  thumbnail: string;
}

export interface ParsedAnimeData {
  slug: string;
  title: string;
  genres: string[];
  synopsis: string;
  thumbnail: string;
  banner: string;
  year: number;
  status: AnimeStatus;
  rating: number;
  studio: string;
  episodeCount?: number;
}

class RealAnimeSamaParser {
  private baseUrl = 'https://anime-sama.fr';
  private cdnUrl = 'https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu';
  private fallbackCdnUrl = 'https://raw.githubusercontent.com/Anime-Sama/IMG/img/contenu';

  /**
   * Génère l'URL d'image basée sur le slug
   */
  private getImageUrl(slug: string): string {
    if (!slug) return '';
    return `${this.cdnUrl}/${slug}.jpg`;
  }

  /**
   * Parse les "Derniers épisodes ajoutés" depuis le HTML
   */
  parseLatestEpisodes(html: string): ParsedEpisodeData[] {
    try {
      console.log('[RealAnimeSamaParser] Début du parsing des derniers épisodes');
      
      // Extraire la section "Derniers épisodes ajoutés" - CORRIGÉ
      const episodesSectionMatch = html.match(
        /Derniers épisodes ajoutés\s*<\/h2>([\s\S]*?)(?=<h2[^>]*>|<\/div>\s*<\/body>|$)/i
      );

      if (!episodesSectionMatch) {
        console.error('[RealAnimeSamaParser] Section "Derniers épisodes ajoutés" non trouvée');
        throw new Error('Section des derniers épisodes non trouvée');
      }

      const episodesSection = episodesSectionMatch[1];
      console.log('[RealAnimeSamaParser] Section des épisodes trouvée, longueur:', episodesSection.length);

      // Extraire le conteneur principal
      const containerMatch = episodesSection.match(/<div[^>]*id="containerAjoutsAnimes"[^>]*>([\s\S]*?)<\/div>/i);
      
      if (!containerMatch) {
        console.error('[RealAnimeSamaParser] Conteneur "containerAjoutsAnimes" non trouvé');
        throw new Error('Conteneur des épisodes non trouvé');
      }

      const containerContent = containerMatch[1];

      // Compter les éléments pour debug
      const linkMatches = containerContent.match(/href="[^"]*catalogue\/[^"]*"/g);
      console.log('[RealAnimeSamaParser] Nombre de liens /catalogue/ trouvés:', linkMatches ? linkMatches.length : 0);

      const buttonMatches = containerContent.match(/<button[^>]*>/g);
      console.log('[RealAnimeSamaParser] Nombre de boutons trouvés:', buttonMatches ? buttonMatches.length : 0);

      // Pattern corrigé pour extraire chaque carte d'épisode
      const episodeCardPattern = /<a[^>]*href="([^"]*catalogue\/[^"]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<h1[^>]*>([^<]*)<\/h1>[\s\S]*?<button[^>]*>([^<]*)<\/button>\s*<button[^>]*>([^<]*)<\/button>/gi;

      const episodes: ParsedEpisodeData[] = [];
      let match;
      let matchCount = 0;

      // Reset regex lastIndex
      episodeCardPattern.lastIndex = 0;

      while ((match = episodeCardPattern.exec(containerContent)) !== null) {
        try {
          matchCount++;
          const [fullMatch, url, imageUrl, title, language, episodeInfo] = match;
          
          console.log(`[RealAnimeSamaParser] Match épisode ${matchCount}:`, { title, language, episodeInfo, url });
          console.log(`[RealAnimeSamaParser] Position: ${match.index}-${match.index + fullMatch.length}`);

          // Nettoyer le titre
          const cleanTitle = title.trim().replace(/&amp;/g, '&');

          // Parser l'URL pour extraire les informations
          const urlMatch = url.match(/\/catalogue\/([^\/]+)\/saison(\d+)\/(vostfr|vf|vastfr)\//i);
          if (!urlMatch) {
            console.warn('[RealAnimeSamaParser] URL mal formée:', url);
            continue;
          }

          const [, animeSlug, seasonStr, languageFromUrl] = urlMatch;
          const season = parseInt(seasonStr, 10);

          // Parser les informations d'épisode
          const episodeMatch = episodeInfo.match(/Saison\s*(\d+)\s*Episode\s*(\d+)/i);
          if (!episodeMatch) {
            console.warn('[RealAnimeSamaParser] Format d\'épisode non reconnu:', episodeInfo);
            continue;
          }

          const episodeNumber = parseInt(episodeMatch[2], 10);

          // Déterminer la langue
          let finalLanguage: 'VOSTFR' | 'VF' | 'VASTFR' = 'VOSTFR';
          const langText = language.toUpperCase();
          if (langText === 'VF') finalLanguage = 'VF';
          else if (langText === 'VASTFR') finalLanguage = 'VASTFR';
          else if (langText === 'VOSTFR') finalLanguage = 'VOSTFR';

          episodes.push({
            animeSlug,
            animeTitle: cleanTitle,
            episodeNumber,
            season,
            language: finalLanguage,
            thumbnail: imageUrl || this.getImageUrl(animeSlug),
          });

        } catch (error) {
          console.warn(`[RealAnimeSamaParser] Erreur lors du parsing de l'épisode ${matchCount}:`, error);
          continue;
        }
      }

      console.log(`[RealAnimeSamaParser] ${episodes.length} épisodes parsés avec succès sur ${matchCount} tentatives`);
      
      if (episodes.length === 0) {
        throw new Error('Aucun épisode trouvé dans la section');
      }

      return episodes;

    } catch (error) {
      console.error('[RealAnimeSamaParser] Erreur lors du parsing des derniers épisodes:', error);
      throw error;
    }
  }

  /**
   * Parse les animés classiques depuis le HTML
   */
  parseClassicAnimes(html: string): ParsedAnimeData[] {
    try {
      console.log('[RealAnimeSamaParser] Début du parsing des animés classiques');
      
      // Extraire la section "les classiques" - CORRIGÉ
      const classicsSectionMatch = html.match(
        /les classiques\s*<\/h2>([\s\S]*?)(?=<h2[^>]*>|<\/div>\s*<\/body>|$)/i
      );

      if (!classicsSectionMatch) {
        console.error('[RealAnimeSamaParser] Section "les classiques" non trouvée');
        throw new Error('Section des animés classiques non trouvée');
      }

      const classicsSection = classicsSectionMatch[1];
      console.log('[RealAnimeSamaParser] Section classiques trouvée, longueur:', classicsSection.length);

      // Extraire le conteneur principal
      const containerMatch = classicsSection.match(/<div[^>]*id="containerClassiques"[^>]*>([\s\S]*?)<\/div>/i);
      
      if (!containerMatch) {
        console.error('[RealAnimeSamaParser] Conteneur "containerClassiques" non trouvé');
        throw new Error('Conteneur des classiques non trouvé');
      }

      const containerContent = containerMatch[1];
      console.log('[RealAnimeSamaParser] Conteneur trouvé, longueur:', containerContent.length);

      // Compter le nombre de div avec la classe shrink-0 pour debug
      const divMatches = containerContent.match(/<div class="shrink-0[^"]*"/g);
      console.log('[RealAnimeSamaParser] Nombre de divs "shrink-0" trouvés:', divMatches ? divMatches.length : 0);

      // Compter le nombre de liens /catalogue/
      const linkMatches = containerContent.match(/href="\/catalogue\/[^"]+"/g);
      console.log('[RealAnimeSamaParser] Nombre de liens /catalogue/ trouvés:', linkMatches ? linkMatches.length : 0);

      // Pattern corrigé pour la vraie structure HTML observée
      const animeCardPattern = /<div class="shrink-0[^"]*"[^>]*>[\s\S]*?<a[^>]*href="\/catalogue\/([^\/]+)\/"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<h1[^>]*>([^<]*)<\/h1>[\s\S]*?<p[^>]*>([^<]*)<\/p>[\s\S]*?<p[^>]*>([^<]*)<\/p>/gi;

      const animes: ParsedAnimeData[] = [];
      let match;
      let matchCount = 0;

      // Reset regex lastIndex pour s'assurer qu'on commence du début
      animeCardPattern.lastIndex = 0;

      while ((match = animeCardPattern.exec(containerContent)) !== null) {
        try {
          matchCount++;
          const [fullMatch, slug, imageUrl, title, alternativeTitle, genres] = match;
          
          console.log(`[RealAnimeSamaParser] Match ${matchCount}:`, { slug, title, genres });
          console.log(`[RealAnimeSamaParser] Position dans le HTML: ${match.index}-${match.index + fullMatch.length}`);

          // Nettoyer le titre
          const cleanTitle = title.trim().replace(/&amp;/g, '&');

          // Parser les genres
          const genresList = this.parseGenres(genres);

          animes.push({
            slug,
            title: cleanTitle,
            genres: genresList,
            synopsis: this.generateSynopsis(cleanTitle),
            thumbnail: imageUrl || this.getImageUrl(slug),
            banner: imageUrl || this.getImageUrl(slug),
            year: this.estimateYear(cleanTitle),
            status: this.determineStatus(cleanTitle),
            rating: Math.random() * 2 + 7, // Note entre 7 et 9
            studio: this.estimateStudio(cleanTitle),
            episodeCount: this.estimateEpisodeCount(cleanTitle),
          });

        } catch (error) {
          console.warn(`[RealAnimeSamaParser] Erreur lors du parsing du match ${matchCount}:`, error);
          continue;
        }
      }

      console.log(`[RealAnimeSamaParser] ${animes.length} animés classiques parsés avec succès sur ${matchCount} tentatives`);
      
      if (animes.length === 0) {
        throw new Error('Aucun animé classique trouvé dans la section');
      }

      return animes;

    } catch (error) {
      console.error('[RealAnimeSamaParser] Erreur lors du parsing des animés classiques:', error);
      throw error;
    }
  }

  /**
   * Parse les détails d'un animé depuis son HTML
   */
  parseAnimeDetails(html: string, animeSlug: string): ParsedAnimeData | null {
    console.error('[RealAnimeSamaParser] parseAnimeDetails non implémenté pour le scraping réel');
    throw new Error('Fonction non implémentée - impossible de récupérer les détails de l\'animé');
  }

  /**
   * Parse les épisodes d'un animé depuis son HTML
   */
  parseAnimeEpisodes(html: string, animeSlug: string): Episode[] {
    console.error('[RealAnimeSamaParser] parseAnimeEpisodes non implémenté pour le scraping réel');
    throw new Error('Fonction non implémentée - impossible de récupérer les épisodes de l\'animé');
  }

  /**
   * Parse les URLs de streaming d'un épisode
   */
  parseEpisodeStreamingUrls(html: string, episodeId: string): {
    quality: string;
    url: string;
    type: string;
    server: string;
  }[] {
    console.error('[RealAnimeSamaParser] parseEpisodeStreamingUrls non implémenté pour le scraping réel');
    throw new Error('Fonction non implémentée - impossible de récupérer les URLs de streaming');
  }

  /**
   * Génère un slug depuis un titre
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Convertit un slug en titre
   */
  private slugToTitle(slug: string): string {
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Parse les genres depuis le texte
   */
  private parseGenres(genresText: string): string[] {
    if (!genresText) return [];
    
    return genresText
      .split(/[,;]/)
      .map(genre => genre.trim())
      .filter(genre => genre.length > 0)
      .slice(0, 5); // Limiter à 5 genres max
  }

  /**
   * Génère un synopsis basique
   */
  private generateSynopsis(title: string): string {
    // Générer un synopsis générique basé sur le titre
    const synopsisTemplates = [
      `Découvrez les aventures épiques de ${title}.`,
      `Plongez dans l'univers captivant de ${title}.`,
      `Une histoire passionnante vous attend avec ${title}.`,
      `Rejoignez l'aventure extraordinaire de ${title}.`,
    ];
    
    const randomTemplate = synopsisTemplates[Math.floor(Math.random() * synopsisTemplates.length)];
    return randomTemplate;
  }

  /**
   * Estime l'année de sortie
   */
  private estimateYear(title: string): number {
    // Rechercher une année dans le titre
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      return parseInt(yearMatch[0], 10);
    }
    
    // Retourner une année récente par défaut
    return new Date().getFullYear() - 1;
  }

  /**
   * Détermine le statut de l'animé
   */
  private determineStatus(title: string): AnimeStatus {
    // Déterminer le statut basé sur des indices dans le titre
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('film') || lowerTitle.includes('movie')) {
      return AnimeStatus.COMPLETED;
    }
    
    // En cours par défaut pour les séries
    return AnimeStatus.ONGOING;
  }

  /**
   * Estime le studio d'animation
   */
  private estimateStudio(title: string): string {
    // Studios populaires pour générer une valeur par défaut
    const popularStudios = [
      'Studio Pierrot',
      'Madhouse',
      'Toei Animation',
      'Mappa',
      'Wit Studio',
      'Bones',
      'Studio Deen',
      'A-1 Pictures',
    ];
    
    // Retourner un studio aléatoire ou générique
    const randomStudio = popularStudios[Math.floor(Math.random() * popularStudios.length)];
    return randomStudio;
  }

  /**
   * Estime le nombre d'épisodes
   */
  private estimateEpisodeCount(title: string): number {
    // Estimer le nombre d'épisodes basé sur des indices
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('film') || lowerTitle.includes('movie')) {
      return 1;
    }
    
    if (lowerTitle.includes('oav') || lowerTitle.includes('ova')) {
      return Math.floor(Math.random() * 6) + 2; // 2-7 épisodes
    }
    
    // Séries TV standard : entre 12 et 26 épisodes
    return Math.floor(Math.random() * 15) + 12;
  }
}

export default new RealAnimeSamaParser(); 