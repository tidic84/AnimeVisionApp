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
    return { cues: cues.filter(cue => sizes[cue.url]), sizes };
  })().catch(() => null);
  return cache[url];
}

export function cueAt(cues: StoryboardCue[], time: number): StoryboardCue | undefined {
  let low = 0, high = cues.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (cues[middle].start > time) high = middle - 1; else low = middle + 1;
  }
  return cues[Math.max(0, high)];
}
