// Coque Windows d'AnimeVision : affiche l'export web Expo (dist-web) dans une fenêtre Electron.
// Le code de l'app est le même que sur Android ; seules les règles réseau propres à un client de bureau sont ici.
const { app, BrowserWindow, protocol, net, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://animevision`;
const DEV_URL = process.argv.includes('--dev') ? 'http://localhost:8081' : null;
const PAGE_ORIGIN = DEV_URL || ORIGIN;
const WEB_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'dist-web');
let catalogPromise;
let catalogStopping = false;
const USER_AGENT = `AnimeVision/${app.getVersion()} (Windows; +https://github.com/tidic84/AnimeVisionApp)`;
// MangaDex refuse les requêtes portant l'origine ou le Referer d'un site tiers (CORS, anti-hotlink) :
// l'app de bureau s'y présente comme un client natif, comme la version Android.
const MANGADEX = /^https:\/\/([a-z0-9-]+\.)*mangadex\.(org|network)\//i;

// Schéma sécurisé et standard : stockage persistant (SQLite web/OPFS, AsyncStorage) et fetch disponibles.
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

function serveWebExport() {
  protocol.handle(SCHEME, async request => {
    const { pathname } = new URL(request.url);
    let file = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(WEB_ROOT)) return new Response('Forbidden', { status: 403 });
    // Application monopage : toute route inconnue renvoie index.html.
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_ROOT, 'index.html');
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    // Isolation requise par SharedArrayBuffer (moteur SQLite web), comme metro.config.js en développement.
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    return new Response(response.body, { status: response.status, headers });
  });
}

function patchNetwork() {
  const fromApp = new Set();
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    const origin = headers.Origin || headers.origin;
    if (origin === PAGE_ORIGIN) fromApp.add(details.id);
    if (MANGADEX.test(details.url)) {
      delete headers.Origin; delete headers.origin; delete headers.Referer; delete headers.referer;
      headers['User-Agent'] = USER_AGENT;
    }
    callback({ requestHeaders: headers });
  });
  // L'API et MangaDex n'autorisent pas l'origine app:// : l'app de bureau accepte leurs réponses pour sa propre page.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!fromApp.delete(details.id)) return callback({});
    const headers = Object.fromEntries(Object.entries(details.responseHeaders || {}).filter(([name]) => !/^access-control-allow-/i.test(name)));
    headers['Access-Control-Allow-Origin'] = [PAGE_ORIGIN];
    headers['Access-Control-Allow-Headers'] = ['*'];
    headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    const preflight = details.method === 'OPTIONS';
    callback({ responseHeaders: headers, statusLine: preflight ? 'HTTP/1.1 204 No Content' : undefined });
  });
  session.defaultSession.webRequest.onErrorOccurred(details => fromApp.delete(details.id));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1360, height: 860, minWidth: 420, minHeight: 560,
    backgroundColor: '#0F1016', title: 'AnimeVision', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.setMenu(null);
  window.on('closed', () => app.quit());
  window.once('ready-to-show', () => window.show());
  // Liens et pop-up : seuls ceux ouverts par l'app partent dans le navigateur ; les publicités des lecteurs sont bloquées.
  window.webContents.setWindowOpenHandler(({ url, referrer }) => {
    const fromPage = !referrer?.url || referrer.url.startsWith(PAGE_ORIGIN);
    // Connexion MyAnimeList : fenêtre de l'app (expo-web-browser suit le pop-up), comme le navigateur intégré sur Android.
    if (fromPage && /^https:\/\/myanimelist\.net\//i.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { parent: window, width: 520, height: 760, autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true } } };
    if (fromPage && /^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(PAGE_ORIGIN)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  // Raccourcis habituels d'une app de bureau (le menu masqué ne les fournit plus).
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { window.setFullScreen(!window.isFullScreen()); event.preventDefault(); }
    else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { window.webContents.reload(); event.preventDefault(); }
    else if (input.key === 'F12' && !app.isPackaged) window.webContents.toggleDevTools();
  });
  void window.loadURL(DEV_URL || `${ORIGIN}/`);
  return window;
}

app.setAppUserModelId('com.tidic84.animevision');
app.whenReady().then(() => {
  serveWebExport();
  patchNetwork();
  catalogPromise = require('./catalog-service.cjs').startCatalog({
    sourceRoot: app.isPackaged ? path.join(process.resourcesPath, 'catalog-server', 'src') : path.join(__dirname, '..', 'catalog-server', 'src'),
    dataDir: path.join(app.getPath('userData'), 'scan-catalog'),
  }).catch(error => { console.error('Catalogue Scan-Manga indisponible :', error.message); return null; });
  let window = createWindow();
  app.on('second-instance', () => { if (window.isMinimized()) window.restore(); window.focus(); });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) window = createWindow(); });
});
app.on('before-quit', event => {
  if (!catalogPromise || catalogStopping) return;
  event.preventDefault(); catalogStopping = true;
  void catalogPromise.then(service => service?.stop()).catch(error => console.error(error.message)).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
