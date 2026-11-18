// Construit l'installateur Windows sur ce poste et l'attache à la release GitHub du tag courant.
// Pendant de publish-apk.cjs quand GitHub Actions n'est pas disponible :
// `npm run release -- patch --local` l'enchaîne après l'APK, ou `node scripts/publish-desktop.cjs` pour un tag déjà publié.
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') throw new Error("L'installateur Windows se construit sous Windows.");

const root = path.join(__dirname, '..');
const env = { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' };
const run = (command, cwd = root) => execSync(command, { cwd, env, stdio: 'inherit' });
const version = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version;
const tag = `v${version}`;
if (!fs.existsSync(path.join(root, '.env'))) throw new Error('.env absent : API_ADDRESS est requis pour l\'export web.');

// L'installateur embarque catalog-server/node_modules (voir desktop/package.json) ; Playwright en est exclu.
run('npm ci --omit=dev --no-audit --no-fund', path.join(root, 'catalog-server'));
run('node scripts/build-desktop.cjs');

const exe = path.join(root, 'dist-desktop', `AnimeVision-Setup-${version}.exe`);
const checksum = `${exe}.sha256`;
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
fs.writeFileSync(checksum, `${sha256}  ${path.basename(exe)}\n`);
let exists = true;
try { execSync(`gh release view ${tag}`, { cwd: root, stdio: 'ignore' }); } catch { exists = false; }
run(exists ? `gh release upload ${tag} "${exe}" "${checksum}" --clobber` : `gh release create ${tag} "${exe}" "${checksum}" --title "AnimeVision ${tag}" --generate-notes --verify-tag`);
console.log(`\nInstallateur ${tag} publié.`);
