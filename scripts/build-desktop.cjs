// Construit l'installateur Windows : export web Expo (dist-web) puis coque Electron + NSIS (dist-desktop).
// `npm run desktop:build` ; `--skip-export` réutilise un dist-web déjà généré.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const desktop = path.join(root, 'desktop');
const run = (command, cwd = root) => execSync(command, { cwd, stdio: 'inherit' });
const version = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version;

if (!process.argv.includes('--skip-export')) run('npx expo export --platform web --output-dir dist-web --clear');
if (!fs.existsSync(path.join(root, 'dist-web', 'index.html'))) throw new Error('dist-web/index.html absent : export web échoué.');
if (!fs.existsSync(path.join(desktop, 'node_modules', 'electron-builder'))) run('npm ci --no-audit --no-fund', desktop);
// La version de l'installateur suit app.json, comme l'APK.
run(`npx electron-builder --win nsis --x64 --publish never -c.extraMetadata.version=${version}`, desktop);
console.log(`\nInstallateur : dist-desktop/AnimeVision-Setup-${version}.exe`);
