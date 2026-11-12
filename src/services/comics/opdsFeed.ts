// Lecture des flux OPDS 1.x (Atom) et de l'extension Page Streaming (OPDS-PSE), sans dépendance :
// Komga, Kavita, Codex, ComicOPDS… exposent ce format. Fonctions pures, testées dans tests/test-comic-catalog.cjs.
// shortcut: lecteur XML par expressions régulières limité à Atom/OPDS (pas de CDATA imbriqué ni d'espaces de noms
// renommés) ; passer à un vrai parseur XML si un serveur produit un flux qui ne passe pas.

export const PSE_REL = 'http://vaemendis.net/opds-pse/stream';
export interface OpdsLink { rel: string; href: string; type: string; title: string; count?: number }
export interface OpdsEntry { id: string; title: string; summary: string; updated: string; links: OpdsLink[] }
export interface OpdsFeed { title: string; entries: OpdsEntry[]; links: OpdsLink[]; total?: number }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decode(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (all, code: string) => code[0] === '#'
      ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
      : ENTITIES[code.toLowerCase()] ?? all);
}
const stripTags = (html: string) => decode(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) result[match[1]] = decode(match[3] ?? match[4] ?? '');
  return result;
}
const text = (xml: string, name: string) => {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? stripTags(match[1]) : '';
};
// Résolution d'adresse relative écrite à la main : l'URL de React Native (Hermes) ne gère pas toutes les bases.
export function absolute(href: string, base: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const origin = base.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i)?.[0] ?? '';
  if (href.startsWith('//')) return `${base.split(':')[0]}:${href}`;
  if (href.startsWith('/')) return origin + href;
  const directory = base.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const parts: string[] = [];
  for (const part of (directory.slice(origin.length) + href).split('/')) {
    if (part === '..') parts.pop(); else if (part !== '.') parts.push(part);
  }
  return origin + parts.join('/');
}

function links(xml: string, base: string): OpdsLink[] {
  return [...xml.matchAll(/<link\b[^>]*>/g)].map(([tag]) => {
    const values = attributes(tag);
    const count = Number(Object.entries(values).find(([name]) => /(^|:)count$/.test(name))?.[1]);
    return { rel: values.rel || '', href: values.href ? absolute(values.href, base).replace(/%7B/gi, '{').replace(/%7D/gi, '}') : '', type: values.type || '', title: values.title || '', count: Number.isFinite(count) ? count : undefined };
  }).filter(link => link.href);
}

export function parseFeed(xml: string, base: string): OpdsFeed {
  const entries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/g)].map(([entry]) => ({
    id: text(entry, 'id'), title: text(entry, 'title'), updated: text(entry, 'updated'),
    summary: text(entry, 'summary') || text(entry, 'content'),
    links: links(entry, base),
  }));
  // Les liens du flux sont ceux hors des entrées.
  const head = xml.replace(/<entry\b[\s\S]*?<\/entry>/g, '');
  const total = Number(text(head, 'opensearch:totalResults'));
  return { title: text(head, 'title'), entries, links: links(head, base), total: Number.isFinite(total) && text(head, 'opensearch:totalResults') ? total : undefined };
}

/** Modèle de recherche d'un document OpenSearch (`{searchTerms}`), de préférence pour un flux Atom. */
export function searchTemplate(xml: string, base: string): string | undefined {
  const urls = [...xml.matchAll(/<Url\b[^>]*>/gi)].map(([tag]) => attributes(tag)).filter(values => values.template);
  const url = urls.find(values => /atom/.test(values.type || '')) || urls[0];
  return url && absolute(url.template, base).replace(/%7B/gi, '{').replace(/%7D/gi, '}');
}

export const isAcquisitionFeed = (link: OpdsLink) => /kind=acquisition/.test(link.type) || (/atom\+xml/.test(link.type) && link.rel === 'subsection');
export const pseLink = (entry: OpdsEntry) => entry.links.find(link => link.rel === PSE_REL && link.count);
export const nextLink = (feed: OpdsFeed) => feed.links.find(link => link.rel === 'next')?.href;
export const thumbnail = (entry: OpdsEntry) =>
  (entry.links.find(link => link.rel === 'http://opds-spec.org/image/thumbnail') || entry.links.find(link => link.rel === 'http://opds-spec.org/image'))?.href;

/** Adresses des pages d'un document en page streaming (pages numérotées à partir de 0). */
export function pageUrls(template: string, count: number, maxWidth = 1600): string[] {
  return Array.from({ length: count }, (_, page) => template.replace('{pageNumber}', String(page)).replace('{maxWidth}', String(maxWidth)));
}
