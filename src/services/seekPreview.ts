import { Image } from 'react-native';
import { resolveUrl, STREAM_USER_AGENT } from './streamHosts';

/** Une vignette de la planche (sprite) publiée par l'hébergeur : zone `xywh` d'une image, valable de `start` à `end`. */
export type StoryboardCue = { start: number; end: number; url: string; x: number; y: number; w: number; h: number };
export type Storyboard = { cues: StoryboardCue[]; sizes: Record<string, { width: number; height: number }> };

const cache: Record<string, Promise<Storyboard | null>> = {};

const seconds = (text: string) => text.split(':').reduce((total, part) => total * 60 + parseFloat(part), 0);

/** Lit un fichier WebVTT de vignettes (format JW Player : une URL `image.jpg#xywh=x,y,w,h` par intervalle). */
export function parseStoryboard(vtt: string, base: string): StoryboardCue[] {
  const cues: StoryboardCue[] = [];
  const lines = vtt.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*([\d:.]+)\s*-->\s*([\d:.]+)/);
    const target = match && lines[index + 1]?.trim();
    if (!match || !target) return;
    const [path, hash = ''] = target.split('#');
    const box = hash.match(/xywh=(\d+),(\d+),(\d+),(\d+)/);
    cues.push({ start: seconds(match[1]), end: seconds(match[2]), url: resolveUrl(path, base), x: box ? +box[1] : 0, y: box ? +box[2] : 0, w: box ? +box[3] : 0, h: box ? +box[4] : 0 });
  });
  return cues.sort((a, b) => a.start - b.start);
}

/** Télécharge la planche une fois par lien et précharge ses images, pour que la vignette s'affiche dès le premier glisser. */
export function loadStoryboard(url: string, headers: Record<string, string> = {}): Promise<Storyboard | null> {
  cache[url] ??= (async () => {
    const response = await fetch(url, { headers: { 'User-Agent': STREAM_USER_AGENT, ...headers } });
    const text = await response.text();
    if (!response.ok || !text.replace(/^\uFEFF/, '').startsWith('WEBVTT')) return null;
    const cues = parseStoryboard(text, response.url || url);
    if (!cues.length) return null;
    const sizes: Storyboard['sizes'] = {};
    await Promise.all([...new Set(cues.map(cue => cue.url))].map(image => new Promise<void>(done =>
      Image.getSizeWithHeaders(image, headers, (width, height) => { sizes[image] = { width, height }; done(); }, () => done()))));
    const fitted = fitStoryboard(cues, sizes);
    return fitted.length ? { cues: fitted, sizes } : null;
  })().catch(() => null);
  return cache[url];
}

// Écart toléré entre l'agrandissement horizontal et vertical d'une planche (arrondis des tailles de vignettes).
const SCALE_TOLERANCE = 0.05;

/**
 * Ramène chaque vignette dans les pixels réels de son image, ou l'écarte si on ne peut pas la découper proprement.
 * Certains hébergeurs (Vidmoly) décrivent une planche plus petite que l'image servie : 15×15 vignettes de 162×90
 * (2430×1350) pour une image de 5040×2820 (vignettes de 336×188). Pris tels quels, les `xywh` tombent à cheval sur
 * plusieurs vignettes ; on les met donc à l'échelle de l'image, axe par axe, d'après l'étendue décrite par le VTT.
 * Des facteurs différents selon l'axe ne sont admis que si la planche décrite tient dans l'image (cases vides en bordure).
 * Sans `xywh`, l'image n'est gardée que si elle a la forme d'une seule vignette (sinon c'est une planche entière).
 */
export function fitStoryboard(cues: StoryboardCue[], sizes: Storyboard['sizes']): StoryboardCue[] {
  const extents: Record<string, { width: number; height: number }> = {};
  for (const cue of cues) {
    if (!(cue.w > 0 && cue.h > 0)) continue;
    const extent = extents[cue.url] ??= { width: 0, height: 0 };
    extent.width = Math.max(extent.width, cue.x + cue.w);
    extent.height = Math.max(extent.height, cue.y + cue.h);
  }
  const fitted: StoryboardCue[] = [];
  for (const cue of cues) {
    const size = sizes[cue.url];
    if (!size || !(size.width > 0 && size.height > 0)) continue;
    const extent = extents[cue.url];
    const boxed = cue.w > 0 && cue.h > 0;
    if (!boxed) {
      // Une image entière sans découpage : acceptable seulement si elle ressemble à une vignette (ex. 16:9, 4:3).
      const ratio = size.width / size.height;
      if (extent || ratio < 1 || ratio > 2.5) continue;
      fitted.push({ ...cue, x: 0, y: 0, w: size.width, h: size.height });
      continue;
    }
    let scaleX = size.width / extent.width, scaleY = size.height / extent.height;
    if (Math.abs(scaleX / scaleY - 1) > SCALE_TOLERANCE) {
      // Facteurs différents : soit une planche juste bordée de cases vides (on garde les xywh tels quels),
      // soit un VTT qui ne décrit pas cette image, et mieux vaut alors ne rien montrer qu'un aperçu cassé.
      if (extent.width > size.width + 1 || extent.height > size.height + 1) continue;
      scaleX = scaleY = 1;
    }
    fitted.push({ ...cue, x: cue.x * scaleX, y: cue.y * scaleY, w: cue.w * scaleX, h: cue.h * scaleY });
  }
  return fitted;
}

export function cueAt(cues: StoryboardCue[], time: number): StoryboardCue | undefined {
  let low = 0, high = cues.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (cues[middle].start > time) high = middle - 1; else low = middle + 1;
  }
  return cues[Math.max(0, high)];
}
