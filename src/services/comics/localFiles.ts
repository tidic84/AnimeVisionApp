// Lecture des fichiers importés : archives d'images (CBZ/ZIP) et PDF. Fonctions pures, partagées Android/Windows.
import { unzipSync } from 'fflate';

export type LocalFormat = 'zip' | 'pdf';
const IMAGE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

export function detectFormat(name: string, bytes?: Uint8Array): LocalFormat | null {
  // Signature d'abord (fichier renommé), extension ensuite.
  if (bytes && bytes.length > 4) {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  }
  if (/\.(cbz|zip)$/i.test(name)) return 'zip';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return null;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** Ordre naturel des pages : "page2" avant "page10", dossiers compris. */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

export const mimeOf = (name: string) => {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
};

/** Images d'une archive, dans l'ordre de lecture. Ignore métadonnées macOS et fichiers cachés. */
export function extractImages(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const entries = unzipSync(bytes, {
    filter: file => IMAGE.test(file.name) && !/(^|\/)(__MACOSX|\.)/.test(file.name) && file.originalSize > 0,
  });
  return Object.keys(entries).sort(naturalCompare).map(name => ({ name, data: entries[name] }));
}

/** Titre lisible depuis le nom du fichier. */
export const titleFromFileName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Sans titre';

// Exécuté dans une page web (Windows) ou une WebView (Android) : rend chaque page PDF en JPEG (~1600 px de large).
export const PDF_RUNNER = `async function renderPdf(libCode, workerCode, data, emit) {
  const url = code => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const lib = await import(url(libCode));
  lib.GlobalWorkerOptions.workerSrc = url(workerCode);
  const task = lib.getDocument({ data, isEvalSupported: false });
  const doc = await task.promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 1600 / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      await emit(i - 1, doc.numPages, canvas.toDataURL('image/jpeg', 0.85));
      page.cleanup();
    }
  } finally { await task.destroy(); }
}`;
