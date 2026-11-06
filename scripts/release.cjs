// Publie une nouvelle version : `npm run release -- 1.2.0` (ou patch / minor / major).
// Met à jour app.json et package.json, commite, crée le tag vX.Y.Z et pousse :
// le workflow GitHub construit alors l'APK et l'attache à la release.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = command => execSync(command, { cwd: root, stdio: 'inherit' });
const appPath = path.join(root, 'app.json');
const pkgPath = path.join(root, 'package.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const arg = process.argv[2];
const [major, minor, patch] = app.expo.version.split('.').map(Number);
const next = arg === 'major' ? `${major + 1}.0.0`
  : arg === 'minor' ? `${major}.${minor + 1}.0`
  : arg === 'patch' || !arg ? `${major}.${minor}.${patch + 1}`
  : arg;
if (!/^\d+\.\d+\.\d+$/.test(next)) throw new Error(`Version invalide : ${next}`);
if (execSync('git status --porcelain', { cwd: root }).toString().trim()) throw new Error('Commitez vos changements avant de publier une version.');

app.expo.version = next;
pkg.version = next;
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
run('git add app.json package.json');
run(`git commit -m "chore: release v${next}"`);
run(`git tag v${next}`);
run('git push origin HEAD --follow-tags');
console.log(`\nv${next} poussée. Suivi du build : gh run watch -R tidic84/AnimeVisionApp`);
