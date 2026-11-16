import { AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dialog } from '../components/Dialog';
import { createLogger } from '../utils/logger';
import { checkApk, extractSha256, parseSha256 } from '../utils/apkIntegrity';
import { createProgressThrottle } from '../utils/progressThrottle';
import { updateNotification } from '../../modules/update-notification';

const log = createLogger('Update');

/** Mises à jour de l'APK Android depuis les releases GitHub du dépôt de l'app. */
const RELEASES_URL = 'https://api.github.com/repos/tidic84/AnimeVisionApp/releases/latest';
const LAST_CHECK_KEY = 'update:lastCheck';
const SKIPPED_KEY = 'update:skippedVersion';
/** Version de la notification « prêt à installer », retirée au démarrage une fois installée. */
const READY_KEY = 'update:readyVersion';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export interface AppUpdate {
  version: string;
  notes: string;
  apkUrl: string;
  pageUrl: string;
  size: number;
  /** Nom de l'asset APK, tel que dans le fichier d'empreinte. */
  apkName: string;
  /** SHA-256 calculé par GitHub pour l'asset (releases récentes). */
  sha256?: string;
  /** Fichier `<apk>.sha256` publié avec la release, lu au moment de l'installation. */
  sha256Url?: string;
}

type ReleaseAsset = { name: string; size?: number; digest?: string; browser_download_url: string };

export const currentVersion = () => Constants.expoConfig?.version ?? '0.0.0';

/** Seul un APK installé peut se remplacer : pas dans Expo Go ni sur le web. */
export const canSelfUpdate = () => Platform.OS === 'android' && !__DEV__ && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

function compareVersions(a: string, b: string) {
  const left = a.split('.').map(part => parseInt(part, 10) || 0);
  const right = b.split('.').map(part => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/** Renvoie la dernière release si elle est plus récente que l'app installée. */
export async function checkForUpdate(): Promise<AppUpdate | null> {
  const response = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (response.status === 404) return null; // aucune release publiée
  if (!response.ok) throw new Error(`GitHub a répondu ${response.status}`);
  const release = await response.json();
  const version = String(release.tag_name ?? '').replace(/^v/i, '');
  const assets: ReleaseAsset[] = release.assets ?? [];
  const apk = assets.find(asset => asset.name.toLowerCase().endsWith('.apk'));
  if (!version || !apk || compareVersions(version, currentVersion()) <= 0) return null;
  const checksum = assets.find(asset => asset.name.toLowerCase() === `${apk.name.toLowerCase()}.sha256`);
  return {
    version, notes: String(release.body ?? '').trim(), apkUrl: apk.browser_download_url, pageUrl: release.html_url, size: apk.size ?? 0,
    apkName: apk.name, sha256: parseSha256(apk.digest) ?? undefined, sha256Url: checksum?.browser_download_url,
  };
}

/** Téléchargement en cours, pour l'afficher dans l'app (Paramètres). */
export interface UpdateProgress {
  version: string;
  /** 0 à 100. */
  percent: number;
  /** Contrôle d'intégrité après le téléchargement. */
  verifying?: boolean;
}

let progressState: UpdateProgress | null = null;
const progressListeners = new Set<(progress: UpdateProgress | null) => void>();
function setProgress(progress: UpdateProgress | null) {
  progressState = progress;
  progressListeners.forEach(listener => listener(progress));
}
export const getUpdateProgress = () => progressState;
export function subscribeUpdateProgress(listener: (progress: UpdateProgress | null) => void) {
  progressListeners.add(listener);
  return () => { progressListeners.delete(listener); };
}

/** Android 13+ : la notification de progression demande POST_NOTIFICATIONS, demandée au moment du téléchargement. */
async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || !updateNotification.available) return false;
  if (Number(Platform.Version) < 33) return true;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(permission)) return true;
    return await PermissionsAndroid.request(permission) === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    log.warn('Permission de notification indisponible:', error);
    return false;
  }
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Installation impossible';

/**
 * Télécharge l'APK (progression dans une notification et dans l'app), le vérifie puis ouvre
 * l'installateur Android, qui demande confirmation. La notification finale « prêt à installer »
 * relance l'installateur au toucher, utile si l'app était en arrière-plan ou l'installateur fermé.
 */
export async function installUpdate(update: AppUpdate, onProgress?: (fraction: number) => void) {
  const notified = await ensureNotificationPermission();
  if (!notified) dialog.alert('Téléchargement en cours', `Shiori v${update.version} se télécharge. La progression s’affiche dans Paramètres > À propos ; l’installateur s’ouvrira à la fin.`);
  const title = `Téléchargement de Shiori v${update.version}`;
  const throttle = createProgressThrottle(2);
  const report = (fraction: number) => {
    const percent = throttle(fraction);
    if (percent === null) return;
    setProgress({ version: update.version, percent });
    updateNotification.progress(title, `${percent} %`, percent);
    onProgress?.(percent / 100);
  };
  setProgress({ version: update.version, percent: 0 });
  updateNotification.progress(title, 'Connexion…', -1);

  let contentUri: string;
  try {
    const target = `${FileSystem.cacheDirectory}AnimeVision-${update.version}.apk`;
    await FileSystem.deleteAsync(target, { idempotent: true });
    const download = FileSystem.createDownloadResumable(update.apkUrl, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : update.size;
      if (total > 0) report(Math.min(1, totalBytesWritten / total));
    });
    const result = await download.downloadAsync();
    if (!result || result.status !== 200) throw new Error('Téléchargement de la mise à jour interrompu');
    setProgress({ version: update.version, percent: 100, verifying: true });
    updateNotification.progress(`Vérification de Shiori v${update.version}`, 'Contrôle de l’intégrité du fichier…', -1);
    await verifyDownload(update, result.uri);
    contentUri = await FileSystem.getContentUriAsync(result.uri);
  } catch (error) {
    updateNotification.failed(`Échec de la mise à jour v${update.version}`, errorMessage(error));
    throw error;
  } finally {
    setProgress(null);
  }

  updateNotification.ready(`Shiori v${update.version} prêt à installer`, 'Touchez pour installer la mise à jour', contentUri);
  await AsyncStorage.setItem(READY_KEY, update.version).catch(() => {});
  // En arrière-plan, Android bloque l'ouverture d'une activité : la notification prend le relais.
  if (AppState.currentState !== 'active') {
    if (!notified) log.warn('Mise à jour prête mais app en arrière-plan sans notification');
    return;
  }
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION : l'installateur lit le fichier de l'app
  });
}

/** Empreinte attendue : celle de GitHub, sinon le fichier .sha256 de la release ; null si aucune. */
async function expectedSha256(update: AppUpdate): Promise<string | null> {
  if (update.sha256) return update.sha256;
  if (!update.sha256Url) return null;
  try {
    const response = await fetch(update.sha256Url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return extractSha256(await response.text(), update.apkName);
  } catch (error) {
    log.warn('Empreinte de la release illisible, vérification par la taille seule:', error);
    return null;
  }
}

/** Rejette un APK tronqué ou corrompu avant d'ouvrir l'installateur. Le hachage est fait en natif, par blocs. */
async function verifyDownload(update: AppUpdate, uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  const actualSize = info.exists ? info.size : null;
  let check = checkApk({ expectedSize: update.size, actualSize });
  if (check.ok) {
    const expected = await expectedSha256(update);
    if (expected) {
      let actual: string | null = null;
      try { actual = await new File(uri).digest('SHA-256'); }
      catch (error) { log.warn('Calcul SHA-256 impossible, vérification par la taille seule:', error); }
      check = checkApk({ expectedSize: update.size, actualSize, expectedSha256: expected, actualSha256: actual });
    }
  }
  if (!check.ok) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    log.warn('APK rejeté:', check.message);
    throw new Error(check.message);
  }
  log.info(`APK vérifié (${check.method})`);
}

let installing = false;
export function promptUpdate(update: AppUpdate, options: { allowSkip?: boolean } = {}) {
  const size = update.size ? ` (${(update.size / 1024 ** 2).toFixed(0)} Mo)` : '';
  const notes = update.notes ? `\n\n${update.notes.slice(0, 600)}` : '';
  const install = async () => {
    if (installing) return;
    installing = true;
    try { await installUpdate(update); }
    catch (error) {
      dialog.alert('Mise à jour', `${errorMessage(error)}.\n\nVous pouvez réessayer ou télécharger l'APK depuis GitHub.`, [
        { text: 'Fermer', style: 'cancel' },
        { text: 'Ouvrir GitHub', onPress: () => void Linking.openURL(update.pageUrl) },
        { text: 'Réessayer', onPress: () => void install() },
      ]);
    } finally { installing = false; }
  };
  dialog.alert(`Version ${update.version} disponible`, `Vous utilisez la version ${currentVersion()}${size}.${notes}`, [
    options.allowSkip
      ? { text: 'Ignorer cette version', style: 'cancel', onPress: () => void AsyncStorage.setItem(SKIPPED_KEY, update.version).catch(() => {}) }
      : { text: 'Plus tard', style: 'cancel' },
    { text: 'Mettre à jour', onPress: () => void install() },
  ]);
}

/** Vérification au démarrage : au plus toutes les 6 h, sans erreur visible si GitHub est injoignable. */
export async function checkOnLaunch() {
  if (!canSelfUpdate()) return;
  try {
    // Notification « prêt à installer » d'une version désormais installée : on la retire.
    const ready = await AsyncStorage.getItem(READY_KEY);
    if (ready && compareVersions(ready, currentVersion()) <= 0) {
      updateNotification.cancel();
      await AsyncStorage.removeItem(READY_KEY);
    }
    const last = Number(await AsyncStorage.getItem(LAST_CHECK_KEY)) || 0;
    if (Date.now() - last < CHECK_INTERVAL) return;
    const update = await checkForUpdate();
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    if (!update || update.version === await AsyncStorage.getItem(SKIPPED_KEY)) return;
    promptUpdate(update, { allowSkip: true });
  } catch (error) {
    log.warn('Vérification impossible:', error);
  }
}
