/** Contrat commun des sources de scans (mangas, manhwas, fichiers locaux) : les écrans ne connaissent que ces types. */
export type ComicKind = 'manga' | 'manhwa' | 'manhua';
export type ComicStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
/** Code de langue MangaDex (fr, en, es-la, pt-br…). */
export type ComicLanguage = string;
/** `added` : ordre d'ajout, parcours complet sans limite (curseur). */
export type ComicOrder = 'popular' | 'latest' | 'rating' | 'title' | 'added';

export interface Comic {
  id: string;
  /** Identifiant du fournisseur (`mangadex`, `local`…). */
  provider: string;
  kind: ComicKind;
  title: string;
  altTitles: string[];
  synopsis: string;
  /** Couverture pleine taille et miniature (listes). */
  cover?: string;
  coverThumb?: string;
  genres: string[];
  status: ComicStatus;
  year?: number;
  /** Langues dans lesquelles des chapitres sont annoncés par le fournisseur. */
  languages: string[];
}

export interface ComicChapter {
  id: string;
  /** Numéro tel que publié ("12", "12.5") ; vide pour un one-shot. */
  number: string;
  title: string;
  /** Volume tel que publié, s'il est connu. */
  volume?: string;
  language: string;
  pages: number;
  group?: string;
  publishedAt?: string;
  /** Chapitre hébergé chez l'éditeur : lisible seulement sur son site. */
  externalUrl?: string;
  available: boolean;
  /** Chapitre verrouillé (premium) : date à laquelle il devient lisible gratuitement, si la source la donne. */
  availableAt?: string;
}

export interface ComicPage {
  url: string;
  /** Version compressée, tentée si l'image principale échoue. */
  fallbackUrl?: string;
}

export interface ComicTag { id: string; name: string }

export interface ComicSearch {
  kind: ComicKind | 'all';
  query?: string;
  tagIds?: string[];
  status?: ComicStatus;
  language: ComicLanguage;
  order: ComicOrder;
  offset: number;
  limit: number;
  /** Suite d'un parcours par curseur (valeur `next` du résultat précédent). */
  cursor?: string;
}

/** `total` peut être NaN si la source ne le donne pas ; `next` : curseur de la page suivante. */
export interface ComicSearchResult { items: Comic[]; total: number; next?: string; warnings?: string[] }

/** Disponibilité réelle d'une traduction : nombre de chapitres lisibles et le plus récent. */
export interface LanguageInfo { language: ComicLanguage; count: number; last?: ComicChapter }

export interface ComicProvider {
  id: string;
  name: string;
  /** Mention à afficher (exigée par les conditions du fournisseur). */
  credit: string;
  listTags(): Promise<ComicTag[]>;
  search(search: ComicSearch): Promise<ComicSearchResult>;
  getComic(id: string): Promise<Comic>;
  getChapters(comicId: string, language: ComicLanguage): Promise<ComicChapter[]>;
  getPages(chapterId: string): Promise<ComicPage[]>;
  /** Absent pour les sources sans traductions (fichiers importés). */
  getLanguageInfo?(comicId: string, language: ComicLanguage): Promise<LanguageInfo>;
  /** Sources sans type connu (fichiers, serveurs) : lecture comme un manga ou un manhwa, choisie par l'utilisateur. */
  setKind?(comicId: string, kind: ComicKind): Promise<void>;
}
