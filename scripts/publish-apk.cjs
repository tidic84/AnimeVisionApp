// Construit l'APK release sur ce poste et l'attache à la release GitHub du tag courant.
// Sert quand GitHub Actions n'est pas disponible : `npm run release -- patch --local`
// ou, pour un tag déjà poussé, `node scripts/publish-apk.cjs`.
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const home = os.homedir();

// Windows limite les chemins à 260 caractères : depuis un dossier profond, la compilation C++
// boucle (« build.ninja still dirty »). On compile donc une copie du même commit dans C:\av.
const shortRoot = process.env.ANDROID_SHORT_ROOT || 'C:\\av';
if (process.platform === 'win32' && path.resolve(root) !== path.resolve(shortRoot)) {
  const git = command => execSync(command, { cwd: shortRoot, stdio: 'inherit' });
  const commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  if (!fs.existsSync(path.join(shortRoot, '.git'))) execSync(`git clone "${root}" "${shortRoot}"`, { stdio: 'inherit' });
  git(`git fetch "${root}" ${commit}`);
  git(`git checkout --force ${commit}`);
  git('git remote set-url origin https://github.com/tidic84/AnimeVisionApp.git');
  fs.copyFileSync(path.join(root, '.env'), path.join(shortRoot, '.env'));
  git('npm ci --no-audit --no-fund');
  git('node scripts/publish-apk.cjs');
  process.exit(0);
}

const keys = process.env.ANDROID_KEYS_DIR || path.join(home, '.android-keys');
const sdk = process.env.ANDROID_HOME || path.join(home, 'tools', 'android-sdk');
const jdk = process.env.JAVA_HOME || path.join(home, 'tools', 'jdk-21.0.12.1+1');
const keystore = path.join(keys, 'animevision-release.jks');
const secrets = path.join(keys, 'animevision-release.txt');
for (const file of [keystore, secrets, sdk, jdk]) if (!fs.existsSync(file)) throw new Error(`Introuvable : ${file}`);

const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: jdk, ANDROID_KEYSTORE_PATH: keystore, PATH: `${path.join(jdk, 'bin')}${path.delimiter}${process.env.PATH}` };
for (const line of fs.readFileSync(secrets, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^(\w+)=(.*)$/);
  if (match) env[match[1]] = match[2];
}
const run = (command, cwd = root) => execSync(command, { cwd, env, stdio: 'inherit' });

const version = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version;
const tag = `v${version}`;
const packageJson = fs.readFileSync(path.join(root, 'package.json'));
run('npx expo prebuild --platform android --no-install --clean');
fs.writeFileSync(path.join(root, 'package.json'), packageJson); // prebuild réécrit les scripts android/ios
// Poste à 16 Go : arm64 seul (téléphones récents) et 2 workers pour limiter la mémoire.
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(`${gradlew} assembleRelease --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a`, path.join(root, 'android'));

const apk = path.join(root, `AnimeVision-${tag}.apk`);
fs.copyFileSync(path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'), apk);
// Empreinte publiée à côté de l'APK (format sha256sum) : l'app la compare avant d'ouvrir l'installateur.
const checksum = `${apk}.sha256`;
const sha256 = require('crypto').createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
fs.writeFileSync(checksum, `${sha256}  ${path.basename(apk)}\n`);
let exists = true;
try { execSync(`gh release view ${tag}`, { cwd: root, stdio: 'ignore' }); } catch { exists = false; }
run(exists ? `gh release upload ${tag} "${apk}" "${checksum}" --clobber` : `gh release create ${tag} "${apk}" "${checksum}" --title "AnimeVision ${tag}" --generate-notes --verify-tag`);
fs.rmSync(apk);
fs.rmSync(checksum);
console.log(`\nAPK ${tag} publié.`);
