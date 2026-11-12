import type { ComicKind } from './comics/types';
import { NAVIGATION_LAYOUTS, NavigationLayout } from './comics/mihon/viewerNavigation';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LANGUAGE_OPTIONS = [
  { value: 'vostfr', label: 'VOSTFR (sous-titré)' },
  { value: 'vf', label: 'VF (doublé)' },
];

/** Version audio préférée, enregistrée par l'écran Paramètres dans `appSettings`. */
export async function getPreferredLanguage(): Promise<string> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem('appSettings')) || '{}');
    return typeof saved.preferredLanguage === 'string' ? saved.preferredLanguage : 'vostfr';
  } catch {
    return 'vostfr';
  }
}

/** Hébergeurs favoris dans l'ordre de préférence (identifiants de `STREAM_HOSTS`), enregistrés dans `appSettings`. */
export async function getFavoriteHosts(): Promise<string[]> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem('appSettings')) || '{}');
    return Array.isArray(saved.favoriteHosts) ? saved.favoriteHosts.filter((value: unknown) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

/** Lecture en arrière-plan / PiP autorisée (désactivée par défaut : la vidéo se met en pause hors de l'app). */
export async function getBackgroundPlayback(): Promise<boolean> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem('appSettings')) || '{}');
    return saved.backgroundPlayback === true;
  } catch {
    return false;
  }
}

/** Mode de lecture des scans : page par page, double page ou défilement vertical continu. */
export type ReaderMode = 'single' | 'double' | 'vertical';
export interface ReaderSettings {
  mode: ReaderMode;
  /** Sens des pages en mode paginé : droite à gauche (manga) ou gauche à droite. */
  direction: 'rtl' | 'ltr';
  /** Ajustement en mode paginé : page entière visible (hauteur) ou largeur de l'écran. */
  fit: 'height' | 'width';
  zoom: number;
  /** Zones d'appui (dispositions reprises de Mihon) ; « sides » = tiers gauche/droit. */
  tapZones: NavigationLayout;
  /** Largeur maximale de lecture sur grand écran (px). */
  readerWidth: number;
}
// Mangas : page par page, de droite à gauche ; manhwas : défilement vertical (webtoon).
export const READER_DEFAULTS: Record<ComicKind, ReaderSettings> = {
  manga: { mode: 'single', direction: 'rtl', fit: 'height', zoom: 1, tapZones: 'sides', readerWidth: 900 },
  manhwa: { mode: 'vertical', direction: 'ltr', fit: 'width', zoom: 1, tapZones: 'off', readerWidth: 800 },
  manhua: { mode: 'vertical', direction: 'ltr', fit: 'width', zoom: 1, tapZones: 'off', readerWidth: 800 },
};

async function readJson(key: string): Promise<any> {
  try { return JSON.parse((await AsyncStorage.getItem(key)) || '{}') || {}; } catch { return {}; }
}

export async function getReaderSettings(kind: ComicKind): Promise<ReaderSettings> {
  const saved = (await readJson('readerSettings'))[kind] || {};
  const base = READER_DEFAULTS[kind];
  return {
    mode: ['single', 'double', 'vertical'].includes(saved.mode) ? saved.mode : base.mode,
    direction: saved.direction === 'ltr' || saved.direction === 'rtl' ? saved.direction : base.direction,
    fit: saved.fit === 'width' || saved.fit === 'height' ? saved.fit : base.fit,
    zoom: Number.isFinite(saved.zoom) ? Math.min(Math.max(saved.zoom, 1), 4) : 1,
    tapZones: Object.prototype.hasOwnProperty.call(NAVIGATION_LAYOUTS, saved.tapZones) ? saved.tapZones : base.tapZones,
    readerWidth: Number.isFinite(saved.readerWidth) ? Math.min(Math.max(saved.readerWidth, 360), 2400) : base.readerWidth,
  };
}

export async function saveReaderSettings(kind: ComicKind, settings: ReaderSettings): Promise<void> {
  const all = await readJson('readerSettings');
  try { await AsyncStorage.setItem('readerSettings', JSON.stringify({ ...all, [kind]: settings })); } catch {}
}

/** Langue des chapitres de scans : préférence globale, et langue retenue par titre (choisie par l'utilisateur). */
export async function getComicLanguage(comicId?: string): Promise<string> {
  const saved = await readJson('comicSettings');
  const titleLanguage = comicId ? saved.titles?.[comicId] : undefined;
  return typeof titleLanguage === 'string' ? titleLanguage : typeof saved.language === 'string' ? saved.language : 'fr';
}
export async function saveComicLanguage(language: string, comicId?: string): Promise<void> {
  const saved = await readJson('comicSettings');
  const next = comicId ? { ...saved, titles: { ...saved.titles, [comicId]: language } } : { ...saved, language };
  try { await AsyncStorage.setItem('comicSettings', JSON.stringify(next)); } catch {}
}
