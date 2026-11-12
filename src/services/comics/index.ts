import scanmanga from './scanmanga';
import { federatedProvider } from './federated';
import mangadex from './mangadex';
import poseidon from './poseidon';
import { localLibrary } from './localLibrary';
import { listServers, opdsProvider } from './opds';
import { ComicChapter, ComicLanguage, ComicProvider, LanguageInfo } from './types';

export * from './types';

/** Sources de scans. Pour en ajouter une : implémenter `ComicProvider` dans ce dossier et l'enregistrer ici. */
const PROVIDERS: Record<string, ComicProvider> = { mangadex, scanmanga, poseidon, online: federatedProvider([mangadex, scanmanga, poseidon]), local: localLibrary };
export const onlineProvider: ComicProvider = mangadex;
export function getProvider(id: string): ComicProvider {
  if (id.startsWith('opds:')) return opdsProvider(id.slice(5));
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Source inconnue : ${id}`);
  return provider;
}

/** Toutes les sources consultables : MangaDex, fichiers importés et serveurs OPDS enregistrés. */
export async function allProviders(): Promise<ComicProvider[]> {
  const servers = await listServers().catch(() => []);
  return [mangadex, scanmanga, poseidon, localLibrary,...servers.map(server => opdsProvider(server.id))];
}

// La fiche et le lecteur partagent la liste des chapitres (précédent/suivant) sans la recharger.
const chapters = new Map<string, { at: number; value: Promise<ComicChapter[]> }>();
export function getChaptersCached(provider: string, comicId: string, language: ComicLanguage, refresh = false): Promise<ComicChapter[]> {
  const key = `${provider}:${comicId}:${language}`;
  const cached = chapters.get(key);
  if (cached && !refresh && Date.now() - cached.at < 10 * 60_000) return cached.value;
  const value = getProvider(provider).getChapters(comicId, language);
  chapters.set(key, { at: Date.now(), value });
  value.catch(() => chapters.delete(key));
  return value;
}

// Disponibilité par langue, partagée par la fiche et le lecteur.
const languageInfo = new Map<string, { at: number; value: Promise<LanguageInfo> }>();
export function getLanguageInfoCached(provider: string, comicId: string, language: ComicLanguage): Promise<LanguageInfo> {
  const source = getProvider(provider);
  if (!source.getLanguageInfo) return Promise.resolve({ language, count: 0 });
  const key = `${provider}:${comicId}:${language}`;
  const cached = languageInfo.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  const value = source.getLanguageInfo(comicId, language);
  languageInfo.set(key, { at: Date.now(), value });
  value.catch(() => languageInfo.delete(key));
  return value;
}

export const chapterLabel = (chapter: Pick<ComicChapter, 'number' | 'title' | 'volume'>) =>
  chapter.number ? `Chapitre ${chapter.number}` : chapter.volume ? `Tome ${chapter.volume}` : chapter.title || 'One-shot';
