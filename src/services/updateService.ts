import { Alert, Linking, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Mises à jour de l'APK Android depuis les releases GitHub du dépôt de l'app. */
const RELEASES_URL = 'https://api.github.com/repos/tidic84/AnimeVisionApp/releases/latest';
const LAST_CHECK_KEY = 'update:lastCheck';
const SKIPPED_KEY = 'update:skippedVersion';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export interface AppUpdate {
  version: string;
  notes: string;
  apkUrl: string;
  pageUrl: string;
  size: number;
}

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
  const apk = (release.assets ?? []).find((asset: { name: string }) => asset.name.toLowerCase().endsWith('.apk'));
  if (!version || !apk || compareVersions(version, currentVersion()) <= 0) return null;
  return { version, notes: String(release.body ?? '').trim(), apkUrl: apk.browser_download_url, pageUrl: release.html_url, size: apk.size ?? 0 };
}

/** Télécharge l'APK puis ouvre l'installateur Android, qui demande confirmation à l'utilisateur. */
export async function installUpdate(update: AppUpdate, onProgress?: (fraction: number) => void) {
  const target = `${FileSystem.cacheDirectory}AnimeVision-${update.version}.apk`;
  await FileSystem.deleteAsync(target, { idempotent: true });
  const download = FileSystem.createDownloadResumable(update.apkUrl, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    const total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : update.size;
    if (total > 0) onProgress?.(Math.min(1, totalBytesWritten / total));
  });
  const result = await download.downloadAsync();
  if (!result || result.status !== 200) throw new Error('Téléchargement de la mise à jour interrompu');
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION : l'installateur lit le fichier de l'app
  });
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
      Alert.alert('Mise à jour', `${error instanceof Error ? error.message : 'Installation impossible'}.\n\nVous pouvez télécharger l'APK depuis GitHub.`, [
        { text: 'Fermer', style: 'cancel' },
        { text: 'Ouvrir GitHub', onPress: () => void Linking.openURL(update.pageUrl) },
      ]);
    } finally { installing = false; }
  };
  Alert.alert(`Version ${update.version} disponible`, `Vous utilisez la version ${currentVersion()}${size}.${notes}`, [
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
    const last = Number(await AsyncStorage.getItem(LAST_CHECK_KEY)) || 0;
    if (Date.now() - last < CHECK_INTERVAL) return;
    const update = await checkForUpdate();
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    if (!update || update.version === await AsyncStorage.getItem(SKIPPED_KEY)) return;
    promptUpdate(update, { allowSkip: true });
  } catch (error) {
    console.warn('[Update] Vérification impossible:', error);
  }
}
