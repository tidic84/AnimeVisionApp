/**
 * Synchronisation avec MyAnimeList :
 * - épisode vu → l'entrée MAL de la saison passe en "watching" (ou "completed") avec le bon compteur ;
 * - ajout à la Watchlist → "plan_to_watch" (si l'anime n'est pas déjà dans la liste MAL) ;
 * - import de la liste MAL → Watchlist et statut local ;
 * - bouton de la page animé : épisodes vus sur MAL → marqués comme vus localement (jamais l'inverse).
 * La synchronisation ne fait jamais baisser un compteur MAL, et ne supprime rien sur MAL.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../apiService';
import databaseService from '../databaseService';
import { Anime, Episode, WatchStatus } from '../../types/anime';
import { createLogger } from '../../utils/logger';
import * as mal from './malService';
import { anilistQuery, fetchFranchise, firstEntry, mainLine, mapEpisode, MalTarget, regularSeasons, resolveAnilistId } from './seasonMapping';

const log = createLogger('MAL');

const PENDING_KEY = 'mal.pending';
// Épisodes vus sans réseau (lecture hors ligne) : la correspondance MAL sera calculée plus tard.
const PENDING_EPISODES_KEY = 'mal.pendingEpisodes';
type WatchedEpisode = Pick<Episode, 'id' | 'saison_id' | 'number'> & { animeId: string };
const synced = new Set<string>();

/** Synchronisation active : compte connecté et option activée dans Mon compte. */
export async function isActive(): Promise<boolean> {
  try {
    const settings = JSON.parse((await AsyncStorage.getItem('appSettings')) || '{}');
    return settings.malEnabled === true && mal.isConfigured() && await mal.isConnected();
  } catch {
    return false;
  }
}

async function target(animeId: string, episode: Pick<Episode, 'saison_id' | 'number'> & Partial<Pick<Episode, 'id'>>): Promise<MalTarget | null> {
  // Les épisodes lus hors ligne viennent de la base locale, qui ne garde pas la saison.
  const seasonId = episode.saison_id || (episode.id ? (await apiService.getEpisodeById(episode.id)).saison_id : undefined);
  if (!seasonId) return null;
  const [anime, seasons] = await Promise.all([apiService.getAnimeById(animeId), apiService.getAnimeSeasons(animeId)]);
  const anilistId = await resolveAnilistId(anime);
  if (!anilistId) return null;
  return mapEpisode(seasons, await fetchFranchise(anilistId), seasonId, episode.number);
}

/** Pousse un épisode vu : n'avance que si MAL est en retard, passe en "completed" au dernier épisode. */
async function push(item: MalTarget): Promise<void> {
  const current = await mal.getListStatus(item.malId);
  if (current && (current.status === 'completed' || current.num_episodes_watched >= item.episode)) return;
  const done = item.total !== null && item.episode >= item.total;
  await mal.updateListStatus(item.malId, { status: done ? 'completed' : 'watching', num_watched_episodes: item.episode });
}

async function queue(item: MalTarget): Promise<void> {
  const pending: MalTarget[] = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) || '[]');
  // Une seule entrée par anime MAL : on garde l'épisode le plus avancé.
  const others = pending.filter(entry => entry.malId !== item.malId);
  const best = pending.find(entry => entry.malId === item.malId);
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...others, best && best.episode > item.episode ? best : item]));
}

/** Renvoie les mises à jour restées en attente (hors connexion, MAL indisponible…). */
export async function flushPending(): Promise<void> {
  if (!await isActive()) return;
  const waiting: WatchedEpisode[] = JSON.parse((await AsyncStorage.getItem(PENDING_EPISODES_KEY)) || '[]');
  const unresolved: WatchedEpisode[] = [];
  for (const episode of waiting) {
    try {
      const item = await target(episode.animeId, episode);
      if (item) await queue(item);
    } catch { unresolved.push(episode); }
  }
  await AsyncStorage.setItem(PENDING_EPISODES_KEY, JSON.stringify(unresolved));
  const pending: MalTarget[] = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) || '[]');
  const failed: MalTarget[] = [];
  for (const item of pending) await push(item).catch(() => failed.push(item));
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(failed));
}

async function queueEpisode(episode: WatchedEpisode): Promise<void> {
  const waiting: WatchedEpisode[] = JSON.parse((await AsyncStorage.getItem(PENDING_EPISODES_KEY)) || '[]');
  const next = [...waiting.filter(entry => entry.id !== episode.id), episode].slice(-200);
  await AsyncStorage.setItem(PENDING_EPISODES_KEY, JSON.stringify(next));
}

/** À appeler quand un épisode est considéré comme vu. Silencieux en cas d'échec (mise en attente). */
export async function episodeWatched(animeId: string, episode: Pick<Episode, 'id' | 'saison_id' | 'number'>): Promise<void> {
  if (synced.has(episode.id) || !await isActive()) return;
  synced.add(episode.id);
  let item: MalTarget | null = null;
  try {
    item = await target(animeId, episode);
    if (!item) return; // saison non régulière ou correspondance douteuse : on ne touche pas à MAL
    await push(item);
    void flushPending();
  } catch (error) {
    if (item) await queue(item).catch(() => {});
    else await queueEpisode({ animeId, id: episode.id, saison_id: episode.saison_id, number: episode.number }).catch(() => {});
    log.warn('Synchronisation reportée :', error instanceof Error ? error.message : error);
  }
}

/** Ajout à la Watchlist : "plan_to_watch" sur la première saison, sauf si l'anime est déjà dans la liste MAL. */
export async function watchlistAdded(anime: Pick<Anime, 'id'>): Promise<void> {
  if (!await isActive()) return;
  try {
    const details = await apiService.getAnimeById(anime.id);
    const anilistId = await resolveAnilistId(details);
    const malId = anilistId ? firstEntry(await fetchFranchise(anilistId))?.idMal : details.malId;
    if (!malId || await mal.getListStatus(malId)) return;
    await mal.updateListStatus(malId, { status: 'plan_to_watch' });
  } catch (error) {
    log.warn('Ajout en Plan to Watch impossible :', error instanceof Error ? error.message : error);
  }
}

/**
 * MAL → app pour une fiche : épisodes (toutes saisons régulières, toutes versions) que la liste MAL
 * donne pour vus. Ne fait que lire MAL ; `entries` = nombre d'entrées MAL avec une progression.
 */
export async function watchedOnMal(animeId: string): Promise<{ episodes: Episode[]; entries: number }> {
  const [anime, seasons] = await Promise.all([apiService.getAnimeById(animeId), apiService.getAnimeSeasons(animeId)]);
  const anilistId = await resolveAnilistId(anime);
  if (!anilistId) throw new Error('Cet animé n’a pas de correspondance MyAnimeList.');
  const franchise = await fetchFranchise(anilistId);
  const statuses = new Map<number, mal.MalListStatus>();
  for (const entry of mainLine(franchise)) {
    if (!entry.idMal || statuses.has(entry.idMal)) continue;
    const status = await mal.getListStatus(entry.idMal);
    if (status && (status.status === 'completed' || status.num_episodes_watched > 0)) statuses.set(entry.idMal, status);
  }
  const seen = (item: MalTarget | null) => {
    const status = item && statuses.get(item.malId);
    return Boolean(item && status && (status.status === 'completed' || item.episode <= status.num_episodes_watched));
  };
  const episodes: Episode[] = [];
  if (!statuses.size) return { episodes, entries: 0 };
  for (const season of regularSeasons(seasons)) {
    // Premier épisode non vu sur MAL : inutile de charger la saison.
    const first = mapEpisode(seasons, franchise, season.id, 1);
    if (!first || !seen(first)) continue;
    for (const episode of await apiService.getSeasonEpisodes(season.id, animeId)) {
      if (seen(mapEpisode(seasons, franchise, season.id, episode.number))) episodes.push({ ...episode, saison_id: episode.saison_id || season.id });
    }
  }
  return { episodes, entries: statuses.size };
}

// ---------------------------------------------------------------------------------------------
// Import de la liste MAL

export interface ImportResult { total: number; matched: number; addedToWatchlist: number; notFound: string[] }

const LOCAL_STATUS: Record<mal.MalStatus, WatchStatus> = {
  watching: WatchStatus.WATCHING, completed: WatchStatus.COMPLETED, on_hold: WatchStatus.ON_HOLD,
  dropped: WatchStatus.DROPPED, plan_to_watch: WatchStatus.NOT_STARTED,
};
const STATUS_RANK: mal.MalStatus[] = ['plan_to_watch', 'dropped', 'on_hold', 'completed', 'watching'];

/** Pour chaque entrée MAL : son identifiant AniList et ceux de ses préquelles (jusqu'à la première saison). */
async function anilistChains(malIds: number[], onProgress?: (text: string) => void): Promise<Map<number, number[]>> {
  const chains = new Map<number, number[]>();
  const prequelOf = new Map<number, number | null>();
  const malToAnilist = new Map<number, number>();
  for (let i = 0; i < malIds.length; i += 50) {
    onProgress?.(`Correspondances AniList… ${Math.min(i + 50, malIds.length)}/${malIds.length}`);
    const data = await anilistQuery<{ Page: { media: any[] } }>(
      'query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { id idMal relations { edges { relationType node { id type } } } } } }',
      { ids: malIds.slice(i, i + 50) }
    );
    for (const media of data.Page.media) {
      malToAnilist.set(media.idMal, media.id);
      const prequel = media.relations.edges.find((edge: any) => ['PREQUEL', 'PARENT'].includes(edge.relationType) && edge.node.type === 'ANIME');
      prequelOf.set(media.id, prequel?.node.id ?? null);
    }
  }
  // Remonte les préquelles inconnues par lots, niveau par niveau.
  for (let depth = 0; depth < 8; depth++) {
    const missing = [...new Set([...prequelOf.values()].filter((id): id is number => id !== null && !prequelOf.has(id)))];
    if (!missing.length) break;
    for (let i = 0; i < missing.length; i += 50) {
      const data = await anilistQuery<{ Page: { media: any[] } }>(
        'query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id relations { edges { relationType node { id type } } } } } }',
        { ids: missing.slice(i, i + 50) }
      );
      for (const media of data.Page.media) {
        const prequel = media.relations.edges.find((edge: any) => ['PREQUEL', 'PARENT'].includes(edge.relationType) && edge.node.type === 'ANIME');
        prequelOf.set(media.id, prequel?.node.id ?? null);
      }
      for (const id of missing) if (!prequelOf.has(id)) prequelOf.set(id, null);
    }
  }
  for (const [malId, anilistId] of malToAnilist) {
    const chain: number[] = [];
    for (let id: number | null | undefined = anilistId; id && !chain.includes(id); id = prequelOf.get(id)) chain.push(id);
    chains.set(malId, chain);
  }
  return chains;
}

/** Importe la liste MAL : Watchlist (en cours, à voir, en pause) et statut local de chaque anime trouvé. */
export async function importList(onProgress?: (text: string) => void): Promise<ImportResult> {
  onProgress?.('Lecture de la liste MyAnimeList…');
  const entries = await mal.getUserList();
  const chains = await anilistChains(entries.map(entry => entry.node.id), onProgress);

  onProgress?.('Recherche dans le catalogue…');
  const allIds = [...new Set([...chains.values()].flat())];
  const catalogue = new Map<number, Anime>();
  for (let i = 0; i < allIds.length; i += 400) {
    for (const anime of await apiService.getAnimesByAnilistIds(allIds.slice(i, i + 400))) if (anime.anilistId) catalogue.set(anime.anilistId, anime);
  }

  // Plusieurs entrées MAL (saisons) peuvent pointer vers la même fiche : on garde le statut le plus "actif".
  const byAnime = new Map<string, { anime: Anime; status: mal.MalStatus; watched: number }>();
  const notFound: string[] = [];
  for (const entry of entries) {
    const anime = (chains.get(entry.node.id) || []).map(id => catalogue.get(id)).find(Boolean);
    if (!anime) { notFound.push(entry.node.title); continue; }
    const previous = byAnime.get(anime.id);
    const status = entry.list_status.status;
    if (!previous || STATUS_RANK.indexOf(status) > STATUS_RANK.indexOf(previous.status)) {
      byAnime.set(anime.id, { anime, status, watched: entry.list_status.num_episodes_watched });
    }
  }

  onProgress?.('Enregistrement…');
  const watchlist = (await databaseService.getAnimeLists()).find(list => list.isDefault);
  let added = 0;
  for (const { anime, status, watched } of byAnime.values()) {
    await databaseService.saveAnime(anime);
    await databaseService.updateUserAnimeStatus({ animeId: anime.id, status: LOCAL_STATUS[status], currentEpisode: watched });
    if (watchlist && ['watching', 'plan_to_watch', 'on_hold'].includes(status) && !watchlist.animeIds.includes(anime.id)) {
      await databaseService.addAnimeToList(watchlist.id, anime.id);
      added++;
    }
  }
  return { total: entries.length, matched: byAnime.size, addedToWatchlist: added, notFound };
}
