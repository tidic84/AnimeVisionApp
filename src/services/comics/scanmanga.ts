import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ADDRESS } from '@env';
import { Comic, ComicChapter, ComicPage, ComicProvider, ComicSearch, ComicSearchResult, ComicTag } from './types';

const KEY = 'scanMangaCatalogServer';
const PREFIX = '/api/comics/scanmanga';
export interface ScanMangaStatus { lastSuccess?: string; lastAttempt?: string; stale: boolean; running?: boolean; error?: string | null; comics: number; chapters: number; catalogScope?: string }
export interface ScanMangaUpdate { comic: Comic; chapter: ComicChapter; detectedAt: string }
export function validateCatalogAddress(input: string): string {
  const url = new URL(input.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Indiquez une adresse http:// ou https:// sans identifiants ni paramètres.');
  return url.href.replace(/\/+$/, '');
}
export async function getScanMangaAddress(): Promise<string> {
  const desktopAddress = typeof window !== 'undefined' && window.location?.protocol === 'app:' ? 'http://127.0.0.1:4318' : '';
  return (await AsyncStorage.getItem(KEY)) || desktopAddress || (API_ADDRESS || '').replace(/\/+$/, '');
}
async function requestAt<T>(address: string, endpoint: string, timeout = 45000): Promise<{ value: T; status: number }> {
  if (!address) throw new Error('Configurez l’adresse du catalogue Scan-Manga.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${address}${PREFIX}${endpoint}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (response.status === 404) throw new Error('Le catalogue Scan-Manga n’est pas installé à cette adresse. Touchez « Configurer ».');
    const value = await response.json();
    if (!response.ok) throw new Error(value?.error || `Le catalogue a répondu ${response.status}.`);
    return { value, status: response.status };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('Le catalogue Scan-Manga met trop de temps à répondre. Réessayez.');
    if (error instanceof TypeError) throw new Error('Le catalogue Scan-Manga est injoignable. Vérifiez son adresse et la connexion.');
    throw error;
  } finally { clearTimeout(timer); }
}
async function request<T>(endpoint: string): Promise<T> { return (await requestAt<T>(await getScanMangaAddress(), endpoint)).value; }
export async function saveScanMangaAddress(input: string): Promise<void> {
  const address = validateCatalogAddress(input);
  const { value } = await requestAt<ScanMangaStatus & { source?: string }>(address, '/status', 12000);
  if (value.source !== 'scanmanga') throw new Error('Cette adresse ne fournit pas un catalogue Scan-Manga compatible.');
  await AsyncStorage.setItem(KEY, address);
}
export const getScanMangaStatus = () => request<ScanMangaStatus>('/status');
function withCover(comic: Comic, address: string): Comic {
  const cover = comic.cover || comic.coverThumb ? `${address}${PREFIX}/covers/${encodeURIComponent(comic.id)}` : undefined;
  return {...comic,cover,coverThumb:cover};
}
export async function getScanMangaUpdates(): Promise<ScanMangaUpdate[]> {
  const address=await getScanMangaAddress();
  return (await requestAt<ScanMangaUpdate[]>(address,'/updates?limit=18')).value.map(update=>({...update,comic:withCover(update.comic,address)}));
}
export function scanSearchPath(search: ComicSearch): string {
  const params = new URLSearchParams({ kind:search.kind, language:search.language, order:search.order, offset:String(search.cursor ? Number(search.cursor) || 0 : search.offset), limit:String(search.limit) });
  if (search.query?.trim()) params.set('q',search.query.trim());
  if (search.status) params.set('status',search.status);
  search.tagIds?.forEach(tag=>params.append('tag',tag));
  return `/catalog?${params}`;
}
const scanmanga: ComicProvider = {
  id:'scanmanga', name:'Scan-Manga', credit:'Catalogue et chapitres : Scan-Manga et les équipes de traduction citées sur chaque chapitre.',
  listTags:()=>request<ComicTag[]>('/tags'),
  async search(search) {
    const address=await getScanMangaAddress();
    const {value}=await requestAt<ComicSearchResult>(address,scanSearchPath(search));
    return {...value,items:value.items.map(comic=>withCover(comic,address))};
  },
  async getComic(id) {
    const address=await getScanMangaAddress();
    return withCover((await requestAt<Comic>(address,`/comics/${encodeURIComponent(id)}`)).value,address);
  },
  getChapters:async (id,language)=>!['fr','all',''].includes(language)?[]:request<ComicChapter[]>(`/comics/${encodeURIComponent(id)}/chapters`),
  async getLanguageInfo(id, language) {
    const chapters = await this.getChapters(id,language), readable=chapters.filter(c=>c.available);
    return { language, count:readable.length,last:readable.at(-1) };
  },
  async getPages(id): Promise<ComicPage[]> {
    const address=await getScanMangaAddress();
    for(const deadline=Date.now()+10*60_000;Date.now()<deadline;) {
      const result=await requestAt<{ pages?:ComicPage[] }>(address,`/chapters/${encodeURIComponent(id)}/pages`);
      if(result.status!==202) {
        if(!result.value.pages?.length)throw new Error('Ce chapitre ne contient aucune page disponible.');
        return result.value.pages.map(page=>({url:new URL(page.url,address).href}));
      }
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    throw new Error('Le chapitre est encore en préparation. Réessayez dans quelques instants.');
  },
};
export default scanmanga;
