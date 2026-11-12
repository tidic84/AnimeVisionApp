// Serveurs OPDS personnels (Komga, Kavita, Codex, ComicOPDS…) : la bibliothèque de l'utilisateur, lue page par page
// grâce à l'extension OPDS-PSE. Chaque serveur devient une source de scans (`opds:<id>`).
// Identifiants : mot de passe dans le stockage sécurisé sur Android, dans le stockage de l'app sur Windows.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Comic, ComicChapter, ComicKind, ComicProvider } from './types';
import { OpdsFeed, nextLink, pageUrls, parseFeed, pseLink, searchTemplate, thumbnail } from './opdsFeed';
import { parseChapterName } from './mihon/chapterRecognition';
import { normalizeTitle } from './duplicates';

export interface OpdsServer { id: string; name: string; url: string; username?: string; password?: string }
const KEY = 'opdsServers';
const KINDS = 'comicKinds';
const secure = Platform.OS !== 'web';
let servers: OpdsServer[] = [];
let ready: Promise<OpdsServer[]> | null = null;

async function readServers(): Promise<OpdsServer[]> {
  let list: OpdsServer[] = [];
  try { list = JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch {}
  if (secure) for (const server of list) server.password = (await SecureStore.getItemAsync(`opds-${server.id}`).catch(() => null)) ?? undefined;
  servers = list;
  return list;
}
export const listServers = (refresh = false) => (!ready || refresh ? (ready = readServers()) : ready);

async function writeServers(list: OpdsServer[]) {
  servers = list;
  ready = Promise.resolve(list);
  await AsyncStorage.setItem(KEY, JSON.stringify(secure ? list.map(({ password, ...rest }) => rest) : list));
}
export async function saveServer(input: Omit<OpdsServer, 'id'> & { id?: string }): Promise<OpdsServer> {
  const server: OpdsServer = { ...input, id: input.id || Date.now().toString(36), url: input.url.trim().replace(/\/+$/, '') };
  if (!/^https?:\/\//i.test(server.url)) throw new Error('L’adresse doit commencer par http:// ou https://');
  await feed(server, server.url); // vérifie adresse et identifiants avant d'enregistrer
  const list = (await listServers()).filter(item => item.id !== server.id);
  if (secure) await (server.password ? SecureStore.setItemAsync(`opds-${server.id}`, server.password) : SecureStore.deleteItemAsync(`opds-${server.id}`));
  await writeServers([...list, server]);
  return server;
}
export async function removeServer(id: string) {
  await writeServers((await listServers()).filter(item => item.id !== id));
  if (secure) await SecureStore.deleteItemAsync(`opds-${id}`).catch(() => {});
}

const authHeader = (server: OpdsServer): Record<string, string> =>
  server.username ? { Authorization: `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${server.username}:${server.password ?? ''}`)))}` } : {};
const originOf = (url: string) => url.match(/^[a-z]+:\/\/[^/]+/i)?.[0]?.toLowerCase();
/** En-têtes des images d'un serveur protégé (couvertures, pages) ; undefined pour les autres adresses. */
export function imageHeaders(url?: string): Record<string, string> | undefined {
  if (!url) return undefined;
  const server = servers.find(item => item.username && originOf(item.url) === originOf(url));
  return server && authHeader(server);
}

async function fetchText(server: OpdsServer, url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/atom+xml, application/xml, */*', ...authHeader(server) } });
  } catch { throw new Error(`Le serveur « ${server.name} » est injoignable.`); } finally { clearTimeout(timeout); }
  if (response.status === 401 || response.status === 403) throw new Error(`« ${server.name} » refuse l’accès : vérifiez l’identifiant et le mot de passe.`);
  if (!response.ok) throw new Error(`« ${server.name} » a répondu ${response.status}.`);
  return response.text();
}
async function feed(server: OpdsServer, url: string): Promise<OpdsFeed> {
  const xml = await fetchText(server, url);
  if (!/<feed\b/.test(xml)) throw new Error(`« ${server.name} » n’a pas renvoyé de catalogue OPDS à cette adresse.`);
  return parseFeed(xml, url);
}

async function kinds(): Promise<Record<string, ComicKind>> {
  try { return JSON.parse((await AsyncStorage.getItem(KINDS)) || '{}'); } catch { return {}; }
}

const providers = new Map<string, ComicProvider>();
const starts = new Map<string, Promise<{ browse: string; search?: string }>>();

/** Source de scans d'un serveur OPDS enregistré. */
export function opdsProvider(serverId: string): ComicProvider {
  const existing = providers.get(serverId);
  if (existing) return existing;
  const id = `opds:${serverId}`;
  const server = async () => {
    const found = (await listServers()).find(item => item.id === serverId);
    if (!found) throw new Error('Ce serveur a été retiré de la bibliothèque.');
    return found;
  };
  // Point de départ : « All series » / « Toutes les séries » s'il existe, sinon la racine ; modèle de recherche OpenSearch.
  const start = (current: OpdsServer) => {
    if (!starts.has(serverId)) starts.set(serverId, (async () => {
      const root = await feed(current, current.url);
      const all = root.entries.find(entry => /^(all series|toutes les s[ée]ries|s[ée]ries)$/i.test(entry.title.trim()))?.links.find(link => /atom/.test(link.type));
      const searchLink = root.links.find(link => link.rel === 'search');
      let search: string | undefined;
      if (searchLink?.href.includes('{searchTerms}')) search = searchLink.href;
      else if (searchLink) search = searchTemplate(await fetchText(current, searchLink.href).catch(() => ''), searchLink.href);
      return { browse: all?.href || current.url, search };
    })().catch(error => { starts.delete(serverId); throw error; }));
    return starts.get(serverId)!;
  };
  const toComic = (entryId: string, title: string, overrides: Record<string, ComicKind>, extra: Partial<Comic> = {}): Comic => ({
    id: entryId, provider: id, kind: overrides[`${id}|${entryId}`] || 'manga', title: title || 'Sans titre', altTitles: [],
    synopsis: '', genres: [], status: 'unknown', languages: [], ...extra,
  });

  const provider: ComicProvider = {
    id,
    name: 'Serveur OPDS',
    credit: 'Bibliothèque personnelle lue depuis votre serveur OPDS.',
    async listTags() { return []; },
    async search(search) {
      const current = await server();
      const { browse, search: template } = await start(current);
      const query = search.query?.trim();
      const url = search.cursor || (query && template ? template.replace('{searchTerms}', encodeURIComponent(query)) : browse);
      const page = await feed(current, url);
      const overrides = await kinds();
      // Une série = une entrée qui mène à un autre flux.
      const toItems = (entries: OpdsFeed['entries']) => entries.map(entry => {
        const link = entry.links.find(item => item.rel === 'subsection' || /atom\+xml/.test(item.type));
        return link && toComic(link.href, entry.title, overrides, { synopsis: entry.summary, cover: thumbnail(entry), coverThumb: thumbnail(entry) });
      }).filter((item): item is Comic => !!item);
      let items = toItems(page.entries);
      // Serveur sans recherche : filtre sur la page parcourue.
      if (query && !template) items = items.filter(item => item.title.toLowerCase().includes(query.toLowerCase()));
      // Recherche plein texte trop stricte (Komga ne trouve pas « one punch » pour « One-Punch Man ») :
      // nouvel essai sur le mot le plus long, puis filtre sur le titre normalisé.
      const word = query?.split(/\s+/).sort((a, b) => b.length - a.length)[0];
      if (query && template && !items.length && !search.cursor && word && word.length >= 3 && word !== query) {
        const retry = await feed(current, template.replace('{searchTerms}', encodeURIComponent(word)));
        items = toItems(retry.entries).filter(item => normalizeTitle(item.title).includes(normalizeTitle(query)));
        return { items, total: items.length };
      }
      const next = nextLink(page);
      return { items, total: page.total ?? (next ? Number.NaN : (search.offset || 0) + items.length), next };
    },
    async getComic(comicId) {
      const current = await server();
      const page = await feed(current, comicId);
      const first = page.entries.find(entry => thumbnail(entry));
      const books = page.entries.filter(entry => pseLink(entry)).length;
      return toComic(comicId, page.title, await kinds(), {
        cover: first && thumbnail(first), coverThumb: first && thumbnail(first),
        synopsis: books ? `${books} document${books > 1 ? 's' : ''} sur « ${current.name} »` : '',
        altTitles: [current.name],
      });
    },
    async getChapters(comicId) {
      const current = await server();
      const chapters: ComicChapter[] = [];
      let url: string | undefined = comicId;
      let title = '';
      for (let pageIndex = 0; url && pageIndex < 50; pageIndex++) {
        const page: OpdsFeed = await feed(current, url);
        title ||= page.title;
        for (const entry of page.entries) {
          const stream = pseLink(entry);
          if (!stream) continue;
          const { chapter, volume } = parseChapterName(entry.title, title);
          // L'identifiant porte le modèle d'adresse et le nombre de pages : getPages n'a pas à relire le flux.
          chapters.push({ id: `${stream.href}|${stream.count}`, number: chapter || '', volume, title: entry.title, language: '', pages: stream.count!, publishedAt: entry.updated || undefined, available: true });
        }
        url = nextLink(page);
      }
      return chapters;
    },
    async getPages(chapterId) {
      const split = chapterId.lastIndexOf('|');
      const template = chapterId.slice(0, split);
      return pageUrls(template, Number(chapterId.slice(split + 1))).map(url => ({ url }));
    },
    async setKind(comicId, kind) {
      const all = await kinds();
      await AsyncStorage.setItem(KINDS, JSON.stringify({ ...all, [`${id}|${comicId}`]: kind }));
    },
  };
  void server().then(current => { provider.name = current.name; }).catch(() => {});
  providers.set(serverId, provider);
  return provider;
}

