const { BrowserWindow, session } = require('electron');

const ORIGIN = 'https://www.scan-manga.com';
const permitted = value => { try { return new URL(value).origin === ORIGIN; } catch { return false; } };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// A small DOM transport for the existing collector, using Electron's normal,
// sandboxed Chromium session. No debugger, browser fingerprint or cookie export.
class SourceLocator {
  constructor(page, selector, parent = 'document', index = 0) {
    Object.assign(this, { page, selector, parent, index });
  }
  collection() { return `(${this.parent}).querySelectorAll(${JSON.stringify(this.selector)})`; }
  element() { return `${this.collection()}[${this.index}]`; }
  first() { return this.nth(0); }
  nth(index) { return new SourceLocator(this.page, this.selector, this.parent, index); }
  locator(selector) { return new SourceLocator(this.page, selector, this.element()); }
  count() { return this.page.evaluate(`${this.collection()}.length`); }
  getAttribute(name) { return this.page.evaluate(`${this.element()}?.getAttribute(${JSON.stringify(name)}) ?? null`); }
  evaluate(fn, argument) { return this.page.evaluate(`(${fn.toString()})(${this.element()}, ${JSON.stringify(argument) ?? 'undefined'})`); }
  async scrollIntoViewIfNeeded() { await this.evaluate(element => element.scrollIntoView({ block: 'center' })); }
  waitFor({ timeout = this.page.timeout } = {}) { return this.page.waitFor(`Boolean(${this.element()})`, timeout); }
}

class SourcePage {
  constructor(window) { this.window = window; this.timeout = 35000; this.status = 200; }
  isClosed() { return this.window.isDestroyed(); }
  setDefaultTimeout(timeout) { this.timeout = timeout; }
  on() {} // Pop-ups are denied by the window's handler.
  async close() { if (!this.isClosed()) this.window.destroy(); }
  evaluate(script) {
    if (this.isClosed()) return Promise.reject(new Error('La fenêtre Scan-Manga a été fermée.'));
    return this.window.webContents.executeJavaScript(script);
  }
  async waitFor(script, timeout) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try { if (await this.evaluate(script)) return; }
      catch (error) { if (this.isClosed()) throw error; }
      await delay(200);
    }
    throw new Error('Les données Scan-Manga attendues ne sont pas disponibles.');
  }
  waitForFunction(fn, argument, { timeout = this.timeout } = {}) {
    return this.waitFor(`(${fn.toString()})(${JSON.stringify(argument) ?? 'undefined'})`, timeout);
  }
  locator(selector) { return new SourceLocator(this, selector); }
  content() { return this.evaluate('document.documentElement.outerHTML'); }
  url() { return this.isClosed() ? '' : this.window.webContents.getURL(); }
  async title() {
    const title = this.isClosed() ? '' : this.window.webContents.getTitle();
    if (/just a moment|attention required|vérification/i.test(title)) this.window.show();
    return title;
  }
  async goto(url, { timeout = this.timeout } = {}) {
    if (!permitted(url)) throw new Error('Adresse Scan-Manga refusée.');
    let timer;
    try {
      await Promise.race([
        this.window.loadURL(url).catch(error => {
          // Chromium can report an HTTP error while displaying the verification.
          if (this.status !== 403 && this.status !== 429) throw error;
        }),
        new Promise((_, reject) => { timer = setTimeout(() => { if (!this.isClosed()) this.window.webContents.stop(); reject(new Error('Chargement Scan-Manga trop long.')); }, timeout); }),
      ]);
      if (this.status === 403) this.window.show();
      return { status: () => this.status };
    } finally { clearTimeout(timer); }
  }
}

function createSourceContext() {
  const windows = new Set();
  const sourceSession = session.fromPartition('persist:animevision-scanmanga');
  sourceSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  sourceSession.setPermissionCheckHandler(() => false);
  sourceSession.on('will-download', event => event.preventDefault());
  return {
    async newPage() {
      const window = new BrowserWindow({
        show: false, width: 1280, height: 900, autoHideMenuBar: true,
        title: 'Scan-Manga — AnimeVision',
        webPreferences: { session: sourceSession, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
      });
      windows.add(window);
      window.on('closed', () => windows.delete(window));
      window.setMenu(null);
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      for (const eventName of ['will-navigate', 'will-redirect']) {
        window.webContents.on(eventName, (event, url) => { if (!permitted(url)) event.preventDefault(); });
      }
      const page = new SourcePage(window);
      window.webContents.on('did-navigate', (_event, _url, code) => { page.status = code; });
      return page;
    },
    async close() { for (const window of windows) if (!window.isDestroyed()) window.destroy(); windows.clear(); },
  };
}

module.exports = { createSourceContext };
