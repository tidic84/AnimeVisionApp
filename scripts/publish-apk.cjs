// Construit l'APK release sur ce poste et l'attache à la release GitHub du tag courant.
// Sert quand GitHub Actions n'est pas disponible : `npm run release -- patch --local`
// ou, pour un tag déjà poussé, `node scripts/publish-apk.cjs`.
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const home = os.homedir();
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
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(`${gradlew} assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a`, path.join(root, 'android'));

const apk = path.join(root, `AnimeVision-${tag}.apk`);
fs.copyFileSync(path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'), apk);
let exists = true;
try { execSync(`gh release view ${tag}`, { cwd: root, stdio: 'ignore' }); } catch { exists = false; }
run(exists ? `gh release upload ${tag} "${apk}" --clobber` : `gh release create ${tag} "${apk}" --title "AnimeVision ${tag}" --generate-notes --verify-tag`);
fs.rmSync(apk);
console.log(`\nAPK ${tag} publié.`);
