import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CatalogStore } from './store.mjs';
import { ScanCollector } from './collector.mjs';
import { CatalogSync } from './sync.mjs';
import { createCatalogServer } from './server.mjs';
import { dataDir, interval, collectorOptions } from './config.mjs';

await mkdir(dataDir,{recursive:true});
const store = new CatalogStore(path.join(dataDir,'catalog.sqlite'));
const interactive = process.argv.includes('--interactive');
const collector = new ScanCollector({ ...collectorOptions, ...(interactive ? { headless: false, keepPage: true, verificationTimeout: 10 * 60_000 } : {}) });
if (interactive) console.log('Laissez Chrome ouvert pendant l’utilisation du catalogue. Effectuez vous-même toute vérification affichée ; aucun CAPTCHA n’est résolu automatiquement.');
const sync = new CatalogSync(store,collector);
const server = createCatalogServer({ store,collector,dataDir,origins:process.env.COMICS_ORIGINS?.split(',').map(s=>s.trim()).filter(Boolean) });
const port=Number(process.env.COMICS_PORT)||4318, host=process.env.COMICS_HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`Catalogue Scan-Manga : http://${host}:${port}/api/comics/scanmanga/status`));
const refresh=()=>sync.run({catalog:!store.counts().comics}).then(result=>console.log('Synchronisation',result)).catch(error=>console.error('Synchronisation interrompue :',error.message));
const timer=setInterval(refresh,interval);
if(process.env.COMICS_AUTO_SYNC!=='false')void refresh();else clearInterval(timer);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);server.close();await collector.close();await sync.pending?.catch(()=>{});store.close();}
process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
