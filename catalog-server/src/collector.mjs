import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ORIGIN, sourceUrl, parseCatalog, parseLatest, parseDetail, parseReader, chapterId } from './parser.mjs';

export class ScanCollector {
  constructor({ dataDir, headless = true, channel, keepPage = false, verificationTimeout = 35000, minDelay = 2500, timeout = 35000 } = {}) {
    Object.assign(this, { dataDir, headless, channel, keepPage, verificationTimeout, minDelay, timeout });
    this.tail = Promise.resolve(); this.lastRequest = 0;
  }
  async context() {
    if (this.closed) throw new Error('Le service de catalogue est arrêté.');
    if (!this.browser) {
      await mkdir(this.dataDir, { recursive: true });
      const { chromium } = await import('playwright');
      this.browser = await chromium.launchPersistentContext(path.join(this.dataDir, 'browser'), {
        chromiumSandbox: true, headless: this.headless, channel: this.channel || undefined, viewport: { width: 1280, height: 900 },
        acceptDownloads: false,
      });
    }
    return this.browser;
  }
  async close() { this.closed = true; if (this.browser) await this.browser.close(); this.browser = null; this.page = null; }
  run(task) {
    const result = this.tail.then(async () => {
      const delay = this.lastRequest + this.minDelay - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      this.lastRequest = Date.now();
      const context = await this.context();
      const page = this.keepPage && this.page && !this.page.isClosed() ? this.page : await context.newPage();
      if (this.keepPage) this.page = page;
      page.setDefaultTimeout(this.timeout);
      if (!page.__scanPopupHandler) { page.__scanPopupHandler = true; page.on('popup', popup => { void popup.close(); }); }
      try { return await task(page); } finally { if (!this.keepPage) await page.close(); }
    });
    this.tail = result.catch(() => {});
    return result;
  }
  async visit(page, url, selector) {
    const safe = sourceUrl(url);
    if (!safe) throw new Error('Adresse Scan-Manga refusée.');
    const response = await page.goto(safe, { waitUntil: 'domcontentloaded', timeout: this.timeout });
    if (response?.status() === 429) throw new Error('Scan-Manga limite les requêtes. La prochaine synchronisation réessaiera.');
    if (response?.status() === 404) throw new Error('Œuvre ou chapitre retiré de Scan-Manga.');
    const challenged = response?.status() === 403 || /just a moment|attention required|vérification/i.test(await page.title());
    if (challenged && this.keepPage) console.log('Scan-Manga attend votre vérification dans Chrome. Laissez cette fenêtre ouverte : l’import reprend dès que les œuvres sont visibles.');
    try { await page.locator(selector).first().waitFor({ state: 'attached', timeout: challenged ? this.verificationTimeout : this.timeout }); }
    catch {
      const title = await page.title();
      if (response?.status() === 403 || /just a moment|attention required|vérification/i.test(title)) {
        throw new Error('Scan-Manga demande une vérification dans le navigateur du service (npm run browser). Le catalogue enregistré reste disponible.');
      }
      throw new Error('La page Scan-Manga n’a pas chargé les données attendues.');
    }
    if (!sourceUrl(page.url())) throw new Error('Redirection hors de Scan-Manga refusée.');
  }
  latest() { return this.run(async page => { await this.visit(page, `${ORIGIN}/?po`, '#content_news article .listing'); return parseLatest(await page.content()); }); }
  detail(url) { return this.run(async page => { await this.visit(page, url, '.contenu_fiche_technique'); return parseDetail(await page.content(), page.url()); }); }
  catalog(url = `${ORIGIN}/TOP-BD-7.html`) {
    return this.run(async page => {
      await this.visit(page, url, '#liste_series .fiche_technique');
      return parseCatalog(await page.content(), page.url());
    });
  }
  chapters(url) { return this.run(async page => { await this.visit(page, url, '#select_chapter option'); return parseReader(await page.content(), page.url()); }); }
  readerFromPublication(url) {
    return this.run(async page => {
      await this.visit(page, url, 'a[href*="/lecture-en-ligne/"]');
      const target = await page.locator('a[href*="/lecture-en-ligne/"]').first().getAttribute('href');
      const safe = sourceUrl(target);
      if (!safe || !chapterId(safe)) throw new Error('Aucun chapitre lisible trouvé pour cette publication.');
      return safe;
    });
  }
  /** `progress` : nombre de pages dès qu'il est connu, puis chaque page dès qu'elle est enregistrée. */
  async pages(chapter, progress = {}) {
    const id = chapterId(chapter.sourceUrl);
    if (id !== chapter.id) throw new Error('Identifiant de chapitre invalide.');
    const folder = createHash('sha256').update(id).digest('hex');
    const dir = path.join(this.dataDir, 'pages', folder);
    // Reuse only a complete cache, for a bounded duration. Incomplete reads never replace it.
    try {
      const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
      if (Date.now() - manifest.at < 6 * 3600_000 && manifest.count > 0) return manifest;
    } catch {}
    return this.run(async page => {
      await this.visit(page, chapter.sourceUrl, '.image-container[data-page]');
      const selected = await page.locator('#select_chapter').evaluate(select => select.value);
      if (selected !== id.split(':').at(-1)) throw new Error('Le lecteur a chargé un autre chapitre que celui demandé.');
      const count = await page.locator('.image-container[data-page]').count();
      if (!count || count > 300) throw new Error('Nombre de pages inattendu.');
      progress.onCount?.(count);
      await mkdir(dir, { recursive: true });
      const files = [];
      for (let index = 0; index < count; index++) {
        // Let the ordinary lazy loader prepare a small batch in parallel.
        if (index % 4 === 0) for (let ahead = index; ahead < Math.min(index + 4, count); ahead++) {
          await page.locator('.image-container[data-page]').nth(ahead).scrollIntoViewIfNeeded();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const container = page.locator('.image-container[data-page]').nth(index);
        await container.scrollIntoViewIfNeeded();
        await page.waitForFunction(i => {
          const image = document.querySelectorAll('.image-container[data-page]')[i]?.querySelector('img');
          return image?.complete && image.naturalWidth > 0;
        }, index, { timeout: this.timeout });
        // Read the image the normal page has rendered, including session-local blob URLs.
        const data = await container.locator('img').evaluate(async image => {
          let blob;
          try {
            const response = await fetch(image.currentSrc || image.src);
            if (!response.ok) throw new Error('Image indisponible');
            blob = await response.blob();
          } catch {
            // Some readers revoke a blob URL after decoding it. Preserve the
            // pixels already displayed by the normal page in that case.
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            if (!canvas.width || !canvas.height || canvas.width * canvas.height > 50_000_000) throw new Error('Dimensions de page invalides.');
            canvas.getContext('2d').drawImage(image, 0, 0);
            blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Page non disponible.')), 'image/png'));
          }
          if (!blob.type.startsWith('image/') || blob.size > 25 * 1024 * 1024) throw new Error('Image invalide ou trop volumineuse');
          return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
        });
        const match = String(data).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is);
        if (!match || match[1] === 'image/svg+xml') throw new Error('Format de page non pris en charge.');
        const bytes = Buffer.from(match[2], 'base64'), hash = createHash('sha256').update(bytes).digest('hex');
        const name = `${index}-${hash}.img`;
        await writeFile(path.join(dir, name), bytes);
        files.push({ name, type: match[1] });
        progress.onPage?.(index, files[index]);
      }
      const manifest = { at: Date.now(), count, folder, files };
      await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
      return manifest;
    });
  }
}
