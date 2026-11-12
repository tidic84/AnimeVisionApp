import http from 'node:http';
import { coverCache } from './covers.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const PREFIX = '/api/comics/scanmanga';
const number = (value, fallback, max) => value === null ? fallback : Math.min(Math.max(Number.parseInt(value, 10) || 0, 0), max);
const validId = value => /^scanmanga:(?:chapter:)?\d+$/.test(value);
export function createCatalogServer({ store, collector, dataDir, origins = ['app://animevision', 'http://localhost:8081', 'http://localhost:8082', 'http://127.0.0.1:8081'] }) {
  const pageJobs = new Map(), chapterJobs = new Map(), getCover = coverCache();
  // Attend qu'une page du chapitre en cours de préparation soit enregistrée (ou l'échec du chapitre), 2 min au plus.
  const waitForPage = (job, index) => new Promise(resolve => {
    const done = () => { clearTimeout(timer); job.listeners.delete(check); resolve(job.files[index]); };
    const check = () => { if (job.files[index] || job.error || job.manifest) done(); };
    const timer = setTimeout(done, 120_000);
    job.listeners.add(check);
  });
  const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS'); }
    if (req.method === 'OPTIONS') { res.writeHead(origin && !origins.includes(origin) ? 403 : 204); return res.end(); }
    if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non autorisée.' });
    try {
      const url = new URL(req.url, 'http://localhost'), p = url.searchParams;
      if (url.pathname === '/health') return json(res, 200, { service: 'animevision-comics', version: 1 });
      if (!url.pathname.startsWith(PREFIX + '/')) return json(res, 404, { error: 'Route inconnue.' });
      const parts = url.pathname.slice(PREFIX.length + 1).split('/').map(decodeURIComponent);
      if (parts[0] === 'status') {
        const sync = store.getState('sync') || {};
        return json(res, 200, { source: 'scanmanga', ...sync, ...store.counts(), stale: !sync.lastSuccess || Date.now() - Date.parse(sync.lastSuccess) > 2 * 3600_000, catalogScope: sync.catalogScope || 'updates' });
      }
      if (parts[0] === 'catalog') return json(res, 200, store.search({ kind:p.get('kind') || 'all', query:p.get('q') || '', language:p.get('language') || 'fr', order:p.get('order') || 'latest', status:p.get('status'), tags:p.getAll('tag'), offset:number(p.get('offset'),0,1000000), limit:Math.max(1,number(p.get('limit'),24,100)) }));
      if (parts[0] === 'tags') return json(res, 200, store.tags());
      if (parts[0] === 'updates') return json(res, 200, store.updates(number(p.get('limit'),24,100)));
      if (parts[0] === 'covers' && /^scanmanga:\d+$/.test(parts[1])) {
        const comic = store.comic(parts[1]);
        if (!comic) return json(res,404,{error:'Œuvre inconnue.'});
        const image = await getCover(comic);
        res.writeHead(200,{'Content-Type':image.type,'Cache-Control':'private, max-age=21600','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin'});
        return res.end(image.bytes);
      }
      if (parts[0] === 'comics' && validId(parts[1])) {
        let comic = store.comic(parts[1]);
        if (!comic) return json(res, 404, { error: 'Œuvre absente du catalogue synchronisé.' });
        if (!parts[2]) {
          if (!comic.synopsis && collector) {
            try { comic = await collector.detail(comic.sourceUrl); store.putComic(comic); } catch { /* Keep the known metadata if the source is down. */ }
          }
          return json(res, 200, comic);
        }
        if (parts[2] === 'chapters') {
          const known = store.chapters(comic.id), state = store.getState(`chapters:${comic.id}`);
          if (collector && (!state?.at || Date.now() - state.at > 10 * 60_000)) {
            if (!chapterJobs.has(comic.id)) {
              const job = (async () => {
                let readUrl = known.at(-1)?.sourceUrl;
                if (!readUrl && comic.publicationUrl) readUrl = await collector.readerFromPublication(comic.publicationUrl);
                if (!readUrl) throw new Error('Aucun lien de chapitre disponible pour cette œuvre.');
                const chapters = await collector.chapters(readUrl);
                store.putChapters(comic.id, chapters); store.setState(`chapters:${comic.id}`, { at: Date.now() });
              })().finally(() => chapterJobs.delete(comic.id));
              chapterJobs.set(comic.id, job);
            }
            // Chapitres déjà connus : affichés tout de suite, la liste se met à jour en arrière-plan.
            if (known.length) chapterJobs.get(comic.id).catch(() => {});
            else await chapterJobs.get(comic.id);
          }
          return json(res, 200, store.chapters(comic.id));
        }
      }
      if (parts[0] === 'chapters' && validId(parts[1]) && parts[2] === 'pages') {
        const chapter = store.chapter(parts[1]);
        if (!chapter) return json(res, 404, { error: 'Chapitre absent du catalogue.' });
        let job = pageJobs.get(chapter.id);
        if (job && Date.now() - job.at > (job.error ? 15000 : 6 * 3600_000)) { pageJobs.delete(chapter.id); job = null; }
        if (!job) {
          if (!collector) throw new Error('Le lecteur Scan-Manga n’est pas disponible sur ce serveur.');
          // Lecture progressive : la liste est servie dès que le nombre de pages est connu ; chaque image attend sa page.
          job = { at: Date.now(), manifest:null, error:null, count:0, files:[], listeners:new Set() }; pageJobs.set(chapter.id,job);
          const notify = () => { for (const listener of job.listeners) listener(); };
          collector.pages(chapter, { onCount: count => { job.count = count; notify(); }, onPage: (index, item) => { job.files[index] = item; notify(); } })
            .then(manifest => { job.manifest = manifest; job.at = Date.now(); store.putChapters(chapter.comicId, [{ ...chapter, pages:manifest.count }]); notify(); })
            .catch(error => { job.error=error.message; job.at=Date.now(); notify(); });
          // Bound per-process job metadata. Cached pages remain on disk.
          if (pageJobs.size > 100) for (const [id, old] of pageJobs) { if (id !== chapter.id && (old.manifest || old.error)) { pageJobs.delete(id); break; } }
        }
        if (job.error) return json(res, 502, { error:job.error });
        const count = job.manifest?.count || job.count;
        if (!count) return json(res, 202, { status:'loading' });
        return json(res, 200, { pages:Array.from({ length: count }, (_,i)=>({url:`${PREFIX}/media/${encodeURIComponent(chapter.id)}/${i}`})) });
      }
      if (parts[0] === 'media' && /^scanmanga:chapter:\d+$/.test(parts[1]) && /^\d+$/.test(parts[2] || '')) {
        if (!store.chapter(parts[1])) return json(res,404,{error:'Chapitre inconnu.'});
        const folder = createHash('sha256').update(parts[1]).digest('hex'), dir=path.join(dataDir,'pages',folder);
        const index = Number(parts[2]), job = pageJobs.get(parts[1]);
        let item;
        if (job && !job.manifest && !job.error) {
          if (job.count && index >= job.count) return json(res,404,{error:'Page inconnue.'});
          item = job.files[index] || await waitForPage(job, index);
          if (!item) return json(res, job.error ? 502 : 504, { error: job.error || 'Page encore en préparation. Réessayez.' });
        } else item = JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')).files[index];
        if (!item || !/^\d+-[a-f0-9]{64}\.img$/.test(item.name)) return json(res,404,{error:'Page inconnue.'});
        const bytes=await readFile(path.join(dir,item.name));
        res.writeHead(200,{'Content-Type':item.type,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin'});return res.end(bytes);
      }
      return json(res,404,{error:'Route inconnue.'});
    } catch(error) {
      if (!res.headersSent) json(res,error.code==='ENOENT'?404:502,{error:error.code==='ENOENT'?'Page non disponible.':String(error.message)});
      else res.end();
    }
  });
  return server;
}
