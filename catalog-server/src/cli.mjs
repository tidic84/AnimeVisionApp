import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CatalogStore } from './store.mjs';
import { ScanCollector } from './collector.mjs';
import { CatalogSync } from './sync.mjs';
import { dataDir, collectorOptions } from './config.mjs';
import { ORIGIN } from './parser.mjs';

const action=process.argv[2];
if(!['sync','catalog','browser'].includes(action))throw Error('Commande attendue : sync, catalog ou browser.');
await mkdir(dataDir,{recursive:true});
const collector=new ScanCollector({...collectorOptions,...(action==='browser'?{headless:false}:{})});
if(action==='browser'){
  const context=await collector.context(),page=await context.newPage();await page.goto(`${ORIGIN}/?po`);
  console.log('Terminez vous-même toute vérification demandée par Scan-Manga, puis fermez cette fenêtre. Aucun CAPTCHA n’est résolu automatiquement.');
  await new Promise(resolve=>context.once('close',resolve));
}else{
  const store=new CatalogStore(path.join(dataDir,'catalog.sqlite'));
  try{console.log(await new CatalogSync(store,collector).run({catalog:action==='catalog'}));}
  catch(error){console.error(error.message);process.exitCode=1;}
  finally{await collector.close();store.close();}
}
