const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { createSourceContext } = require('./electron-source.cjs');

async function startCatalog({ sourceRoot, dataDir, port = 4318, autoSync = true }) {
  const load = name => import(pathToFileURL(path.join(sourceRoot, name)).href);
  const [{ CatalogStore }, { CatalogSync }, { ScanCollector }, { createCatalogServer }] = await Promise.all([
    load('store.mjs'), load('sync.mjs'), load('collector.mjs'), load('server.mjs'),
  ]);
  await fs.mkdir(dataDir, { recursive: true });
  const store = new CatalogStore(path.join(dataDir, 'catalog.sqlite'));
  const collector = new ScanCollector({ dataDir, keepPage: true, verificationTimeout: 10 * 60_000 });
  collector.browser = createSourceContext();
  const sync = new CatalogSync(store, collector);
  const server = createCatalogServer({ store, collector, dataDir });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) { await collector.close(); store.close(); throw error; }
  const refresh = () => sync.run({ catalog: !store.counts().comics })
    .then(result => console.log('Scan-Manga synchronisé :', result))
    .catch(error => console.error('Scan-Manga :', error.message));
  const timer = autoSync ? setInterval(refresh, 30 * 60_000) : null;
  if (autoSync) void refresh();
  let stopped = false;
  return {
    store, collector, sync, port: server.address().port,
    async stop() {
      if (stopped) return; stopped = true;
      clearInterval(timer); server.close(); server.closeAllConnections();
      await collector.close();
      await sync.pending?.catch(() => {});
      await collector.tail.catch(() => {});
      store.close();
    },
  };
}

module.exports = { startCatalog };
