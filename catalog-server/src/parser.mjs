import { load } from 'cheerio';

export const ORIGIN = 'https://www.scan-manga.com';
export function sourceUrl(value, base = ORIGIN) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    if (url.origin !== ORIGIN || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
export function comicId(url) {
  const safe = sourceUrl(url);
  const id = safe && new URL(safe).pathname.match(/^\/(\d+)(?:-\d+)?\/[^/]+\.html$/)?.[1];
  return id ? `scanmanga:${id}` : null;
}
export function chapterId(url) {
  const safe = sourceUrl(url);
  const id = safe && new URL(safe).pathname.match(/^\/lecture-en-ligne\/[^/]+_(\d+)\.html$/)?.[1];
  return id ? `scanmanga:chapter:${id}` : null;
}
const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
const plain = ($, node) => clean($(node).clone().find('span,script,style').remove().end().text());
const statusOf = text => /termin/i.test(text) ? 'completed' : /pause|arrêt/i.test(text) ? 'hiatus' : /cours/i.test(text) ? 'ongoing' : 'unknown';
const kindOf = text => /manhwa/i.test(text) ? 'manhwa' : /manhua/i.test(text) ? 'manhua' : /manga/i.test(text) ? 'manga' : null;
function imageUrl(value) {
  try { const u = new URL(value, ORIGIN); return u.protocol === 'https:' && /(^|\.)scan-manga\.com$/.test(u.hostname) ? u.href : undefined; } catch { return undefined; }
}
function fields($, panel) {
  const labels = $(panel).find('.contenu_titres_fiche_technique > ul > li').toArray();
  const values = $(panel).find('.contenu_texte_fiche_technique > ul > li').toArray();
  return Object.fromEntries(labels.map((node, index) => [clean($(node).text()), values[index]]));
}
function metadata($, panel, url, title, cover) {
  const map = fields($, panel);
  const kind = kindOf($(map['Catégorie']).text());
  const id = comicId(url);
  if (!id || !kind || !clean(title)) return null; // novels and malformed records are not comics
  const genres = $(map.Genres).find('a').toArray().map(node => plain($, node)).filter(Boolean);
  // Keep the application's existing exclusion of explicitly adult works.
  if (genres.some(g => /^(adulte|smut|hentai)$/i.test(g))) return null;
  return {
    id, provider: 'scanmanga', title: clean(title), sourceUrl: sourceUrl(url), kind,
    altTitles: [], synopsis: '', cover: imageUrl(cover), coverThumb: imageUrl(cover),
    genres, status: statusOf($(map.Statut).text()), languages: ['fr'],
    year: Number(clean($(map['Année']).text())) || undefined,
    latestChapterLabel: clean($(map['Dernier chapitre']).text()) || undefined,
    publicationUrl: sourceUrl($(map['Dernier chapitre']).find('a').attr('href')) || undefined,
  };
}
export function parseCatalog(html, url = ORIGIN) {
  const $ = load(html);
  const items = [];
  $('#liste_series .fiche_technique').each((_, panel) => {
    const link = $(panel).find('h3 a').first();
    const image = $(panel).prev('.image_manga').find('img');
    const item = metadata($, panel, link.attr('href'), link.text(), image.attr('data-original') || image.attr('src'));
    if (item) items.push({ ...item, rank: items.length + 1 });
  });
  // Only actual page links, never the alphabet/rank anchors within the same document.
  const next = $('a[rel="next"], .pagination a, #pagination a').toArray()
    .map(a => ({ url: sourceUrl($(a).attr('href'), url), text: clean($(a).text()), rel: $(a).attr('rel') }))
    .find(a => a.url && a.url !== sourceUrl(url) && (a.rel === 'next' || /suivant|next|[›»]/i.test(a.text)))?.url;
  return { items: [...new Map(items.map(item => [item.id, item])).values()], next };
}
export function parseDetail(html, url) {
  const $ = load(html);
  const panel = $('.contenu_fiche_technique').first();
  const title = $('h2').first().text();
  const comic = metadata($, panel, url, title, panel.find('img[itemprop="image"], .image_manga img').first().attr('src'));
  if (!comic) {
    const map=fields($,panel);
    const excluded=$(map.Genres).find('a').toArray().some(node=>/^(adulte|smut|hentai)$/i.test(plain($,node)));
    const error=new Error(excluded ? 'Œuvre hors du périmètre du catalogue.' : 'Fiche Scan-Manga non reconnue.');
    if(excluded)error.code='EXCLUDED';
    throw error;
  }
  comic.synopsis = clean($('.texte_synopsis_manga [itemprop="description"]').text() || $('.texte_synopsis_manga').text());
  return comic;
}
export function parseLatest(html) {
  const $ = load(html);
  const result = [];
  $('#content_news article .listing').each((_, node) => {
    const row = $(node), work = row.find('a.nom_manga').first(), chapter = row.find('a.lel_tchapt').first();
    const workUrl = sourceUrl(work.attr('href')), readUrl = sourceUrl(chapter.attr('href'));
    const id = comicId(workUrl), cid = chapterId(readUrl);
    if (!id || !cid || /\(Novel\)/i.test(work.text())) return;
    const seconds = Number(row.attr('datetime'));
    result.push({ comicId: id, comicUrl: workUrl, title: clean(work.text()), chapter: {
      id: cid, sourceUrl: readUrl, number: clean(chapter.text()).match(/Chapitres?\s+(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.') || '',
      title: clean(chapter.text()), language: 'fr', pages: 0, available: true,
      group: row.find('a.nom_team').toArray().map(a => clean($(a).text())).join(', ') || undefined,
      publishedAt: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined,
    } });
  });
  if (!result.length) throw new Error('Le flux Scan-Manga est vide ou son format a changé. Le catalogue précédent est conservé.');
  return [...new Map(result.map(item => [item.chapter.id, item])).values()];
}
export function parseReader(html, url) {
  const $ = load(html);
  const chapters = [];
  $('#select_chapter option').each((_, node) => {
    const option = $(node), numberId = option.attr('value');
    if (!/^\d+$/.test(numberId || '')) return;
    const title = clean(option.text());
    // The site routes readers by the numeric suffix; select values supply that stable id.
    const nextUrl = sourceUrl(url)?.replace(/_\d+\.html(?:\?.*)?$/, `_${numberId}.html`);
    if (!nextUrl || !chapterId(nextUrl)) return;
    chapters.push({ id: `scanmanga:chapter:${numberId}`, sourceUrl: nextUrl,
      number: title.match(/^\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.') || '', title,
      language: 'fr', pages: 0, available: true });
  });
  if (!chapters.length) throw new Error('La liste des chapitres Scan-Manga n’a pas été chargée.');
  return chapters.reverse();
}
