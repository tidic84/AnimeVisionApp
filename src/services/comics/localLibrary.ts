// Bibliothèque de fichiers importés (CBZ, ZIP d'images, PDF), exposée comme un fournisseur de scans :
// favoris, chapitres lus, reprise et lecteur fonctionnent comme pour MangaDex.
// Les pages sont extraites une fois à l'import : fichiers de l'app sur Android, IndexedDB sur Windows/web.
import { parseChapterName } from './mihon/chapterRecognition';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Buffer } from 'buffer';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Comic, ComicChapter, ComicKind, ComicPage, ComicProvider } from './types';
import { PDF_RUNNER, detectFormat, extractImages, mimeOf, titleFromFileName } from './localFiles';

const KEY = 'localComics';
const web = Platform.OS === 'web';

export interface LocalComic { id: string; title: string; fileName: string; format: 'zip' | 'pdf'; kind: ComicKind; files: string[]; addedAt: number }

async function readList(): Promise<LocalComic[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; }
}
const writeList = (list: LocalComic[]) => AsyncStorage.setItem(KEY, JSON.stringify(list));
const nativeDir = (id: string) => `${FileSystem.documentDirectory}comics/${id}/`;

// --- Stockage web : une entrée IndexedDB par page ---
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('animevision-comics', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('pages');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function idbRun<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pages', mode);
    const request = run(transaction.objectStore('pages'));
    transaction.oncomplete = () => { db.close(); resolve(request ? request.result : undefined); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

async function savePage(id: string, index: number, name: string, data: Uint8Array): Promise<string> {
  const file = `${String(index).padStart(4, '0')}.${name.split('.').pop()!.toLowerCase()}`;
  if (web) await idbRun('readwrite', store => { store.put(new Blob([data as BlobPart], { type: mimeOf(file) }), `${id}/${file}`); });
  else await FileSystem.writeAsStringAsync(nativeDir(id) + file, Buffer.from(data).toString('base64'), { encoding: FileSystem.EncodingType.Base64 });
  return file;
}

// --- PDF ---
type PdfEmit = (index: number, total: number, dataUrl: string) => Promise<void> | void;
/** Sur Android, rendu délégué à la WebView de `PdfRenderHost` (pdf.js a besoin d'un canvas). */
let nativePdfRenderer: ((code: [string, string], base64: string, emit: PdfEmit) => Promise<void>) | null = null;
export const registerPdfRenderer = (renderer: typeof nativePdfRenderer) => { nativePdfRenderer = renderer; };

async function pdfCode(): Promise<[string, string]> {
  const assets = [Asset.fromModule(require('../../../assets/pdfjs/pdf.min.pdfjs')), Asset.fromModule(require('../../../assets/pdfjs/pdf.worker.min.pdfjs'))];
  if (web) return Promise.all(assets.map(async asset => (await fetch(asset.uri)).text())) as Promise<[string, string]>;
  await Promise.all(assets.map(asset => asset.downloadAsync()));
  return Promise.all(assets.map(asset => FileSystem.readAsStringAsync(asset.localUri!))) as Promise<[string, string]>;
}

async function renderPdf(bytes: Uint8Array, emit: PdfEmit) {
  const code = await pdfCode();
  if (web) {
    const render = new Function(`${PDF_RUNNER}; return renderPdf;`)();
    await render(code[0], code[1], bytes, emit);
    return;
  }
  if (!nativePdfRenderer) throw new Error('Le moteur PDF n’est pas prêt.');
  await nativePdfRenderer(code, Buffer.from(bytes).toString('base64'), emit);
}

const dataUrlBytes = (dataUrl: string) => new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));

/** Importe un fichier choisi par l'utilisateur ; `onProgress` reçoit les pages traitées. */
export async function importLocalComic(asset: DocumentPickerAsset, onProgress?: (done: number, total: number) => void): Promise<LocalComic> {
  // shortcut: le fichier entier est chargé en mémoire (archives de quelques centaines de Mo max) ; passer à une lecture en flux si besoin.
  const bytes = web && asset.file ? new Uint8Array(await asset.file.arrayBuffer())
    : new Uint8Array(Buffer.from(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }), 'base64'));
  const format = detectFormat(asset.name, bytes);
  if (!format) throw new Error('Format non pris en charge : choisissez un fichier CBZ, ZIP ou PDF.');
  const id = `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (!web) await FileSystem.makeDirectoryAsync(nativeDir(id), { intermediates: true });
  const files: string[] = [];
  try {
    if (format === 'zip') {
      let images: { name: string; data: Uint8Array }[];
      try { images = extractImages(bytes); } catch { throw new Error('Archive illisible ou corrompue.'); }
      if (!images.length) throw new Error('Cette archive ne contient aucune image.');
      for (let index = 0; index < images.length; index++) {
        files.push(await savePage(id, index, images[index].name, images[index].data));
        onProgress?.(index + 1, images.length);
      }
    } else {
      await renderPdf(bytes, async (index, total, dataUrl) => {
        files[index] = await savePage(id, index, 'page.jpg', dataUrlBytes(dataUrl));
        onProgress?.(index + 1, total);
      });
      if (!files.length) throw new Error('Ce PDF ne contient aucune page.');
    }
  } catch (error: any) {
    await removeFiles(id).catch(() => {});
    throw new Error(error?.message || 'Import impossible.');
  }
  const item: LocalComic = { id, title: titleFromFileName(asset.name), fileName: asset.name, format, kind: 'manga', files, addedAt: Date.now() };
  await writeList([item, ...(await readList())]);
  return item;
}

async function removeFiles(id: string) {
  if (web) await idbRun('readwrite', store => { store.delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`)); });
  else await FileSystem.deleteAsync(nativeDir(id), { idempotent: true });
}

export async function deleteLocalComic(id: string): Promise<void> {
  await removeFiles(id);
  await writeList((await readList()).filter(item => item.id !== id));
}

/** Change le type (sens et mode de lecture par défaut) d'un fichier importé. */
export async function setLocalComicKind(id: string, kind: ComicKind): Promise<void> {
  await writeList((await readList()).map(item => item.id === id ? { ...item, kind } : item));
}

const blobUrls = new Map<string, string>();
async function pageUrl(item: LocalComic, file: string): Promise<string> {
  if (!web) return nativeDir(item.id) + file;
  const key = `${item.id}/${file}`;
  if (!blobUrls.has(key)) {
    const blob = await idbRun<Blob>('readonly', store => store.get(key));
    if (!blob) return '';
    blobUrls.set(key, URL.createObjectURL(blob));
  }
  return blobUrls.get(key)!;
}

async function toComic(item: LocalComic): Promise<Comic> {
  const cover = item.files[0] ? await pageUrl(item, item.files[0]).catch(() => '') : '';
  return { id: item.id, provider: 'local', kind: item.kind, title: item.title, altTitles: [item.fileName], synopsis: `${item.format === 'pdf' ? 'PDF' : 'Archive d’images'} importée · ${item.files.length} pages`, cover: cover || undefined, coverThumb: cover || undefined, genres: [], status: 'unknown', languages: [] };
}

async function find(id: string): Promise<LocalComic> {
  const item = (await readList()).find(entry => entry.id === id);
  if (!item) throw new Error('Ce fichier a été supprimé de la bibliothèque.');
  return item;
}

export const localLibrary: ComicProvider = {
  id: 'local',
  name: 'Fichiers importés',
  credit: 'Fichier importé depuis cet appareil.',
  async listTags() { return []; },
  async search(search) {
    const query = search.query?.trim().toLowerCase() || '';
    const list = (await readList()).filter(item => !query || item.title.toLowerCase().includes(query));
    return { items: await Promise.all(list.map(toComic)), total: list.length };
  },
  async getComic(id) { return toComic(await find(id)); },
  setKind: setLocalComicKind,
  async getChapters(comicId): Promise<ComicChapter[]> {
    const item = await find(comicId);
    // Numéro ou tome lu dans le nom du fichier (reconnaissance reprise de Mihon).
    const { chapter, volume } = parseChapterName(item.title);
    return [{ id: item.id, number: chapter || '', volume, title: item.title, language: '', pages: item.files.length, available: true }];
  },
  async getPages(chapterId): Promise<ComicPage[]> {
    const item = await find(chapterId);
    const urls = await Promise.all(item.files.map(file => pageUrl(item, file)));
    return urls.map(url => ({ url }));
  },
};
