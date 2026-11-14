export class CatalogSync {
  constructor(store, collector) { this.store = store; this.collector = collector; this.pending = null; }
  run({ catalog = false, maxCatalogPages = 50 } = {}) {
    if (this.pending) return this.pending;
    this.pending = this.sync({ catalog, maxCatalogPages }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async sync({ catalog, maxCatalogPages }) {
    const previous = this.store.getState('sync') || {};
    const state = { ...previous, running: true, lastAttempt: new Date().toISOString(), error: null, itemErrors: 0, excludedItems: 0 };
    this.store.setState('sync', state);
    try {
      // The live feed is required before declaring a successful synchronization.
      const updates = await this.collector.latest();
      if (catalog) {
        let url, pages = 0; const visited = new Set();
        do {
          if (this.collector.closed) throw new Error('Synchronisation arrêtée.');
          const page = await this.collector.catalog(url);
          if (!page.items.length) throw new Error('Catalogue vide inattendu : les données précédentes sont conservées.');
          for (const comic of page.items) this.store.putComic(comic);
          pages++;
          url = page.next;
          if (url && visited.has(url)) throw new Error('La pagination du catalogue tourne en boucle.');
          if (url) visited.add(url);
        } while (url && pages < maxCatalogPages);
        state.catalogPages = pages;
        state.catalogScope = 'top-and-updates'; // The public Top is not the entire site's catalogue.
        state.catalogTruncated = !!url;
      }
      const fresh = new Map();
      for (const release of updates) {
        if (this.collector.closed) throw new Error('Synchronisation arrêtée.');
        let comic = fresh.get(release.comicId) || this.store.comic(release.comicId);
        if (!comic) {
          try { comic = await this.collector.detail(release.comicUrl); this.store.putComic(comic); fresh.set(comic.id, comic); }
          catch (error) { if(error.code==='EXCLUDED')state.excludedItems++;else{state.itemErrors++;state.lastItemError=String(error.message);} continue; }
        }
        this.store.putChapters(comic.id, [release.chapter]);
      }
      if (state.itemErrors === updates.length) throw new Error('Aucune œuvre du flux n’a pu être importée.');
      state.lastSuccess = new Date().toISOString();
      state.error = state.itemErrors ? `${state.itemErrors} œuvre(s) n’ont pas pu être actualisées. Les autres mises à jour sont conservées.` : null;
      return this.store.counts();
    } catch (error) { state.error = String(error.message); throw error; }
    finally { state.running = false; this.store.setState('sync', state); }
  }
}
