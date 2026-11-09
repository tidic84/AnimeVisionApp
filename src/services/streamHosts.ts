import { StreamingServer } from '../types/anime';

/**
 * Hébergeurs vidéo connus. Les noms des serveurs viennent d'anime-sama et ne correspondent souvent pas
 * à l'hébergeur réel (un « Sibnet » pointe vers Voe, « Serveur 2 » vers OneUpload…) : on identifie par le domaine.
 */
export const STREAM_HOSTS = [
  { id: 'voe', label: 'Voe' },
  { id: 'uqload', label: 'Uqload' },
  { id: 'oneupload', label: 'OneUpload' },
  { id: 'vidhide', label: 'VidHide' },
  { id: 'sibnet', label: 'Sibnet' },
  { id: 'sendvid', label: 'Sendvid' },
  { id: 'vidmoly', label: 'Vidmoly' },
  { id: 'vk', label: 'VK' },
  { id: 'embed4me', label: 'Embed4me' },
] as const;
export type StreamHostId = typeof STREAM_HOSTS[number]['id'];

// User-Agent commun à l'extraction et au lecteur : Voe lie le lien du flux au User-Agent qui a ouvert la page.
export const STREAM_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const parse = (url: string) => { try { return new URL(url); } catch { return null; } };
// Le URL de React Native ne sait pas résoudre un chemin relatif (il colle la base et le chemin) : on le fait ici.
export function resolveUrl(path: string, base: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('//')) return `${base.split(':')[0]}:${path}`;
  if (path.startsWith('/')) return (base.match(/^https?:\/\/[^/?#]+/)?.[0] ?? '') + path;
  return base.split(/[?#]/)[0].replace(/[^/]*$/, '') + path;
}

export function hostOf(url: string): { id: string; label: string } {
  const parsed = parse(url);
  const host = parsed?.hostname.toLowerCase() ?? '';
  const known = (id: StreamHostId) => STREAM_HOSTS.find(item => item.id === id)!;
  if (host.includes('voe')) return known('voe');
  if (host.includes('uqload')) return known('uqload');
  if (host.includes('oneupload') || host.includes('ansembed')) return known('oneupload');
  if (host.includes('vidhide') || host.includes('minochinos') || host.includes('callistanise')) return known('vidhide');
  if (host.includes('sibnet')) return known('sibnet');
  if (host.includes('sendvid')) return known('sendvid');
  if (host.includes('vidmoly')) return known('vidmoly');
  if (host === 'vk.com' || host.endsWith('.vk.com') || host.includes('vkvideo')) return known('vk');
  if (host.includes('embed4me')) return known('embed4me');
  // Les miroirs de Voe changent de domaine sans cesse (susanexpectcare.com, shannoncoldalready.com…) mais gardent /e/<code>.
  if (/^\/e\/[a-z0-9]{10,}\/?$/i.test(parsed?.pathname ?? '')) return known('voe');
  return { id: host || 'inconnu', label: host.replace(/^www\./, '') || 'Lecteur' };
}

/** Lien d'embed sans identifiant de vidéo (ex. `shell.php?videoid=`, `embed-.html`) : il n'ouvrira jamais rien. */
export function isBrokenEmbed(url: string): boolean {
  const parsed = parse(url);
  if (!parsed) return true;
  return /[?&](videoid|oid|id)=(&|$)/i.test(parsed.search) || /\/(embed-?|e|v)\/?(\.html)?$/i.test(parsed.pathname)
    || /embed-\.html$/i.test(parsed.pathname) || (parsed.hostname.includes('embed4me') && parsed.hash.length < 2);
}

export type StreamQuality = { label: string; url: string; height?: number };
export type StreamProbe =
  | { status: 'ok'; url: string; headers: Record<string, string>; qualities: StreamQuality[]; height?: number }
  | { status: 'dead'; reason: string }
  /** Flux non extractible mais lien a priori valide : seul le lecteur web peut l'ouvrir. */
  | { status: 'embed'; reason: string };

const DEAD_TEXT = /file (was )?(not found|deleted|removed)|video (not found|is not available|has been (deleted|removed))|fichier (introuvable|supprimé)|this video (is unavailable|was deleted)|"error_msg":"access denied|<title>\s*(404|not found)/i;

async function get(url: string, headers: Record<string, string> = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': STREAM_USER_AGENT, Accept: '*/*', ...headers }, signal: controller.signal });
    return { status: response.status, url: response.url || url, text: await response.text() };
  } finally { clearTimeout(timer); }
}

/** Décompresse les scripts `eval(function(p,a,c,k,e,d)…)` utilisés par Uqload, VidHide, Vidmoly… */
export function unpack(html: string): string {
  const out: string[] = [];
  const pattern = /\}\('((?:[^'\\]|\\.)*)',\s*(\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const [, payload, baseText, countText, words] = match;
    const base = Number(baseText);
    const keys = words.split('|');
    const encode = (n: number): string => (n < base ? '' : encode(Math.floor(n / base))) + ((n = n % base) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
    const dict: Record<string, string> = {};
    for (let count = Number(countText); count--;) dict[encode(count)] = keys[count] || encode(count);
    out.push(payload.replace(/\\'/g, '\'').replace(/\b\w+\b/g, word => dict[word] ?? word));
  }
  return out.join('\n');
}

/** Voe : la configuration du lecteur est un JSON chiffré (ROT13, séparateurs parasites, base64, décalage de 3, inversion, base64). */
export function decodeVoe(html: string): { source?: string; fallback?: { file: string; label?: string }[] } | null {
  const encoded = html.match(/<script type="application\/json">\s*\["([^"]+)"\]/)?.[1];
  if (!encoded) return null;
  try {
    let text = encoded.replace(/[a-zA-Z]/g, char => { const start = char <= 'Z' ? 65 : 97; return String.fromCharCode((char.charCodeAt(0) - start + 13) % 26 + start); });
    for (const junk of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) text = text.split(junk).join('');
    text = Array.from(atob(text), char => String.fromCharCode(char.charCodeAt(0) - 3)).join('');
    return JSON.parse(atob(text.split('').reverse().join('')));
  } catch { return null; }
}

const MEDIA = /https?:(?:\/\/|\\\/\\\/)[^"'\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?(?=["'\s<>]|$)/gi;
// Vidéos de démonstration que certaines pages glissent comme leurre.
const DECOY = /test-videos\.co\.uk|bigbuckbunny|sample-videos|\/ads?\//i;

function findMedia(text: string): string[] {
  const urls = (text.match(MEDIA) ?? []).map(url => url.replace(/\\\//g, '/')).filter(url => !DECOY.test(url));
  // Les liens HLS d'abord : ils annoncent les résolutions disponibles.
  return [...new Set(urls)].sort((a, b) => Number(/\.m3u8/i.test(b)) - Number(/\.m3u8/i.test(a)));
}

function candidates(host: string, html: string, pageUrl: string): { url: string; height?: number }[] {
  if (host === 'voe') {
    const config = decodeVoe(html);
    if (!config) return [];
    return [
      ...(config.source ? [{ url: config.source }] : []),
      ...(config.fallback ?? []).map(item => ({ url: item.file, height: Number(item.label) || undefined })),
    ].filter(item => /^https?:\/\//.test(item.url));
  }
  if (host === 'sibnet') {
    const path = html.match(/player\.src\(\[\{src:\s*"([^"]+\.mp4[^"]*)"/)?.[1];
    return path ? [{ url: resolveUrl(path, pageUrl) }] : [];
  }
  if (host === 'sendvid') {
    const source = html.match(/<source src="([^"]+)"/)?.[1] ?? html.match(/property="og:video" content="([^"]+)"/)?.[1];
    return source ? [{ url: source.replace(/&amp;/g, '&') }] : [];
  }
  const unpacked = unpack(html);
  // VidHide expose plusieurs liens : hls2 est un vrai .m3u8, hls3/hls4 des variantes servies en .txt.
  const links = unpacked.match(/"hls2":"([^"]+)"/)?.[1];
  const label = (unpacked + html).match(/label:\s*"(\d{3,4})p/i)?.[1];
  return [...(links ? [links] : []), ...findMedia(unpacked), ...findMedia(html)]
    .filter((url, index, list) => list.indexOf(url) === index)
    .map(url => ({ url, height: /\.mp4/i.test(url) && label ? Number(label) : undefined }));
}

/** Lit le manifeste HLS principal : une entrée par résolution annoncée (RESOLUTION=…x720). */
async function hlsVariants(url: string, headers: Record<string, string>): Promise<StreamQuality[] | null> {
  const response = await get(url, headers, 10000);
  if (response.status >= 400 || !response.text.includes('#EXTM3U')) return null;
  const lines = response.text.split(/\r?\n/);
  const variants: StreamQuality[] = [];
  lines.forEach((line, index) => {
    const height = line.startsWith('#EXT-X-STREAM-INF') ? Number(line.match(/RESOLUTION=\d+x(\d+)/)?.[1]) : 0;
    const next = lines.slice(index + 1).find(value => value.trim() && !value.startsWith('#'));
    if (height && next) variants.push({ label: `${height}p`, url: resolveUrl(next.trim(), url), height });
  });
  return variants.filter((item, index) => variants.findIndex(other => other.height === item.height) === index).sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

/** Teste un lecteur : extrait le flux direct, vérifie qu'il répond et relève sa résolution quand elle est annoncée. */
export async function probeServer(server: StreamingServer): Promise<StreamProbe> {
  if (isBrokenEmbed(server.url)) return { status: 'dead', reason: 'Lien du lecteur incomplet' };
  const host = hostOf(server.url).id;
  if (host === 'embed4me') return { status: 'embed', reason: 'Lecteur web uniquement' };
  try {
    // Sans Referer : Uqload refuse les pages demandées depuis anime-sama (« Video embed restricted for this domain »).
    let page = await get(server.url);
    // Voe passe d'abord par une page de redirection en JavaScript vers son domaine du moment.
    const redirect = page.text.length < 4000 ? page.text.match(/window\.location\.href\s*=\s*'(https?:\/\/[^']+)'/)?.[1] : undefined;
    if (redirect) page = await get(redirect);
    if (page.status === 404 || page.status === 410) return { status: 'dead', reason: 'Vidéo supprimée' };
    // L'appareil fait lui-même la requête : un refus ici (ex. Sibnet depuis certains réseaux français) vaut aussi pour le lecteur web.
    if (page.status === 403) return { status: 'dead', reason: 'Accès refusé par l’hébergeur' };
    if (page.status >= 400) return { status: 'dead', reason: `Erreur ${page.status}` };
    if (DEAD_TEXT.test(page.text.slice(0, 200000))) return { status: 'dead', reason: 'Vidéo supprimée ou privée' };
    const origin = new URL(page.url).origin;
    const headers = { 'User-Agent': STREAM_USER_AGENT, Referer: `${origin}/` };
    for (const candidate of candidates(host, page.text, page.url)) {
      if (/\.m3u8/i.test(candidate.url)) {
        const variants = await hlsVariants(candidate.url, headers).catch(() => null);
        if (!variants) continue;
        const qualities = variants.length > 1 ? [{ label: 'Auto', url: candidate.url }, ...variants] : [];
        return { status: 'ok', url: candidate.url, headers, qualities, height: variants[0]?.height };
      }
      return { status: 'ok', url: candidate.url, headers, qualities: [], height: candidate.height };
    }
    return { status: 'embed', reason: 'Flux non extractible' };
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? { status: 'dead', reason: 'Le lecteur ne répond pas' } : { status: 'embed', reason: 'Lecteur injoignable' };
  }
}

/** Trie les lecteurs selon la liste de favoris (par hébergeur), en gardant l'ordre d'origine pour le reste. */
export function orderServers<T extends StreamingServer>(servers: T[], favorites: string[]): T[] {
  const rank = (server: T) => { const index = favorites.indexOf(hostOf(server.url).id); return index < 0 ? favorites.length : index; };
  return servers.map((server, index) => ({ server, index })).sort((a, b) => rank(a.server) - rank(b.server) || a.index - b.index).map(item => item.server);
}
