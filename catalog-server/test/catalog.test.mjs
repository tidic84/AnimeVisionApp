import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogStore } from '../src/store.mjs';
import { CatalogSync } from '../src/sync.mjs';
import { createCatalogServer, PREFIX } from '../src/server.mjs';
import { parseLatest, parseCatalog, parseDetail, parseReader, sourceUrl, comicId } from '../src/parser.mjs';

// Minimal fixtures preserve the public DOM structure observed on 11 November 2026.
const fields = `<div class="contenu_titres_fiche_technique"><ul><li>Catégorie</li><li>Genres</li><li>Année</li><li>Dernier chapitre</li><li>Statut</li></ul></div><div class="contenu_texte_fiche_technique"><ul><li>Manhwa Seinen</li><li><a class="infoBulle"><span>Genre description</span>Action</a></li><li>2025</li><li><a href="/publications/Test-Chapitre-53_123.html">Webtoon Ch 53</a></li><li>En cours</li></ul></div>`;
const detail = `<h2>Unrivaled Spear Ghost</h2><div class="contenu_fiche_technique"><div class="image_manga"><img itemprop="image" src="https://static.scan-manga.com/img/manga/cover.jpg"></div>${fields}</div><div class="texte_synopsis_manga"><p itemprop="description">Résumé de test.</p></div>`;
const top = `<div id="liste_series"><div class="image_manga"><img data-original="https://static.scan-manga.com/img/manga/cover.jpg"></div><div class="fiche_technique"><h3>7 <a href="/15407/Unrivaled-Spear-Ghost.html">Unrivaled Spear Ghost</a></h3>${fields}</div></div>`;
const feed = `<div id="content_news"><article><div class="listing" datetime="1794411655"><a class="nom_manga" href="/15407-12345/Unrivaled-Spear-Ghost.html">Unrivaled Spear Ghost</a><a class="lel_tchapt" href="/lecture-en-ligne/Unrivaled-Spear-Ghost-Chapitre-52-FR_582323.html">Chapitre 52</a><a class="nom_team">Poséidon</a></div></article></div>`;
const comic = parseDetail(detail,'https://www.scan-manga.com/15407/Unrivaled-Spear-Ghost.html');
const release = parseLatest(feed)[0];

test('parses actual DOM shapes, stable IDs, genre labels and dates',()=>{
  assert.equal(comic.id,'scanmanga:15407'); assert.equal(comic.kind,'manhwa');assert.deepEqual(comic.genres,['Action']);assert.equal(comic.synopsis,'Résumé de test.');
  assert.equal(parseCatalog(top).items[0].id,comic.id);assert.equal(release.comicId,comic.id);assert.equal(release.chapter.group,'Poséidon');
  assert.equal(release.chapter.publishedAt,new Date(1794411655000).toISOString());
  assert.equal(comicId('/15407-999/Unrivaled-Spear-Ghost.html'),comic.id);
  assert.equal(sourceUrl(undefined),null);assert.equal(sourceUrl('https://evil.test/15407/a.html'),null);assert.equal(sourceUrl('http://www.scan-manga.com/1/x.html'),null);
  assert.throws(()=>parseLatest('<h1>Just a moment...</h1>'),/vide/);
  assert.throws(()=>parseDetail(detail.replace('Manhwa Seinen','Novel'),comic.sourceUrl));
});
test('chapter selector is ordered and not treated as new releases',()=>{
  const chapters=parseReader('<select id="select_chapter"><option value="12">12 - Fin</option><option value="11">11</option></select>',release.chapter.sourceUrl);
  assert.deepEqual(chapters.map(c=>c.number),['11','12']);assert.match(chapters[0].sourceUrl,/_11\.html$/);
  const db=new CatalogStore();try{db.putComic(comic);db.putChapters(comic.id,chapters);assert.deepEqual(db.updates(),[]);}finally{db.close();}
});
test('upserts do not duplicate records, erase summaries or change publication times',()=>{
  const db=new CatalogStore();try{
    db.putComic(comic);db.putComic({...comic,synopsis:''});assert.equal(db.comic(comic.id).synopsis,comic.synopsis);
    db.putChapters(comic.id,[release.chapter]);db.putChapters(comic.id,[{...release.chapter,publishedAt:undefined,pages:20}]);
    assert.deepEqual(db.counts(),{comics:1,chapters:1});assert.equal(db.updates()[0].chapter.publishedAt,release.chapter.publishedAt);
    assert.equal(db.search({kind:'manhwa',query:'Unrivaled spear',tags:['Action']}).total,1);assert.equal(db.search({language:'en'}).total,0);
    assert.equal(db.search({query:"%' OR 1=1 --"}).total,0);
  }finally{db.close();}
});
test('pagination keeps distinct titles and counts',()=>{
  const db=new CatalogStore();try{for(let i=1;i<6;i++)db.putComic({...comic,id:`scanmanga:${i}`,title:`Titre ${i}`});
    const first=db.search({order:'title',limit:2}),second=db.search({order:'title',limit:2,offset:Number(first.next)});
    assert.equal(first.total,5);assert.equal(first.next,'2');assert.equal(second.next,'4');assert.equal(new Set([...first.items,...second.items].map(c=>c.id)).size,4);
  }finally{db.close();}
});
test('failed sync preserves last success and every existing record',async()=>{
  const db=new CatalogStore();try{db.putComic(comic);db.putChapters(comic.id,[release.chapter]);db.setState('sync',{lastSuccess:'2026-11-10T12:00:00Z'});
    const sync=new CatalogSync(db,{latest:async()=>{throw Error('403 verification');}});await assert.rejects(sync.run(),/403/);
    assert.deepEqual(db.counts(),{comics:1,chapters:1});assert.equal(db.getState('sync').lastSuccess,'2026-11-10T12:00:00Z');assert.equal(db.getState('sync').running,false);
  }finally{db.close();}
});
test('simultaneous syncs share the same run; a repeated feed adds nothing',async()=>{
  const db=new CatalogStore();let calls=0;try{const sync=new CatalogSync(db,{latest:async()=>{calls++;return [release];},detail:async()=>comic});
    await Promise.all([sync.run(),sync.run()]);assert.equal(calls,1);await sync.run();assert.deepEqual(db.counts(),{comics:1,chapters:1});
  }finally{db.close();}
});
test('HTTP contract supports search, details, chapters, status and failed page jobs',async()=>{
  const db=new CatalogStore();db.putComic(comic);db.putChapters(comic.id,[release.chapter]);
  const server=createCatalogServer({store:db,collector:{chapters:async()=>[release.chapter],pages:async()=>{throw Error('Source unavailable');}},dataDir:'.'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}${PREFIX}`;
  try{
    assert.equal((await (await fetch(base+'/catalog?kind=manhwa')).json()).total,1);
    assert.equal((await (await fetch(base+'/comics/'+encodeURIComponent(comic.id))).json()).id,comic.id);
    assert.equal((await (await fetch(base+'/comics/'+encodeURIComponent(comic.id)+'/chapters')).json()).length,1);
    assert.equal((await (await fetch(base+'/status')).json()).source,'scanmanga');
    const pages=base+'/chapters/'+encodeURIComponent(release.chapter.id)+'/pages';assert.equal((await fetch(pages)).status,202);
    const failed=await fetch(pages);assert.equal(failed.status,502);assert.match((await failed.json()).error,/Source unavailable/);
    assert.equal((await fetch(base+'/comics/https%3A%2F%2Fevil.test')).status,404);
    assert.equal((await fetch(base+'/status',{method:'POST'})).status,405);
    assert.equal((await fetch(base+'/status',{method:'OPTIONS',headers:{Origin:'https://evil.test'}})).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('chapter pages are served progressively, before the whole chapter is stored',async()=>{
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { createHash } = await import('node:crypto');
  const dataDir=await mkdtemp(path.join(tmpdir(),'scan-pages-'));
  const dir=path.join(dataDir,'pages',createHash('sha256').update(release.chapter.id).digest('hex'));await mkdir(dir,{recursive:true});
  let progress,finish;
  const store=async index=>{const name=`${index}-${'a'.repeat(64)}.img`;await writeFile(path.join(dir,name),Buffer.from([index]));progress.onPage(index,{name,type:'image/png'});};
  const collector={chapters:async()=>[release.chapter],pages:(_chapter,callbacks)=>{progress=callbacks;return new Promise(resolve=>{finish=resolve;});}};
  const db=new CatalogStore();db.putComic(comic);db.putChapters(comic.id,[release.chapter]);
  const server=createCatalogServer({store:db,collector,dataDir});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}${PREFIX}`;
  try{
    const pages=base+'/chapters/'+encodeURIComponent(release.chapter.id)+'/pages';
    assert.equal((await fetch(pages)).status,202);
    progress.onCount(2);await store(0);
    const list=await (await fetch(pages)).json();assert.equal(list.pages.length,2,'list served as soon as the count is known');
    assert.deepEqual([...new Uint8Array(await (await fetch(base+'/media/'+encodeURIComponent(release.chapter.id)+'/0')).arrayBuffer())],[0]);
    const second=fetch(base+'/media/'+encodeURIComponent(release.chapter.id)+'/1');
    await new Promise(resolve=>setTimeout(resolve,50));await store(1);
    assert.deepEqual([...new Uint8Array(await (await second).arrayBuffer())],[1],'a pending page waits for its file');
    assert.equal((await fetch(base+'/media/'+encodeURIComponent(release.chapter.id)+'/5')).status,404);
    finish({at:Date.now(),count:2,files:[]});
  }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dataDir,{recursive:true,force:true});}
});


test('interactive collection keeps the verified tab; shutdown never relaunches it', async()=>{
  const { ScanCollector } = await import('../src/collector.mjs');
  let opened=0,closed=0;
  const page={isClosed:()=>false,setDefaultTimeout(){},on(){},close:async()=>{closed++;}};
  const context={newPage:async()=>{opened++;return page;},close:async()=>{}};
  const collector=new ScanCollector({keepPage:true,minDelay:0});collector.browser=context;
  assert.equal(await collector.run(async p=>p),page);
  assert.equal(await collector.run(async p=>p),page);
  assert.equal(opened,1);assert.equal(closed,0);
  await collector.close();await assert.rejects(()=>collector.run(async()=>{}),/arrêté/);
  const transient=new ScanCollector({minDelay:0});transient.browser=context;
  await transient.run(async()=>{});assert.equal(closed,1);await transient.close();
});


test('public covers use a bounded cache and reject arbitrary hosts', async()=>{
  const {coverCache}=await import('../src/covers.mjs');let calls=0;
  const getCover=coverCache({maxEntries:1,fetchImage:async(url,options)=>{calls++;assert.equal(options.headers.Referer,'https://www.scan-manga.com/');return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}});}});
  const first={cover:'https://static.scan-manga.com/a.jpg'};
  await getCover(first);await getCover(first);assert.equal(calls,1);
  await getCover({cover:'https://static.scan-manga.com/b.jpg'});await getCover(first);assert.equal(calls,3);
  await assert.rejects(()=>getCover({cover:'http://127.0.0.1/private'}),/non disponible/);
});
