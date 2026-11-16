/**
 * Signalement d'un animé ou d'un épisode (« Signaler un problème ») : envoyé à l'API (`POST /api/report`),
 * il attend que le scraper re-scrape l'animé (tous les lecteurs redemandés à anime-sama), puis porte le résultat.
 * L'app retient aussi ses propres signalements 24 h pour afficher « déjà signalé » sans réseau.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { API_ADDRESS } from '@env';

export type ReportReason = 'no_player' | 'wrong_episode' | 'wrong_info' | 'other';
export type ReportStatus = 'pending' | 'processing' | 'done' | 'failed' | 'ignored';

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'no_player', label: 'Aucun lecteur ne marche', hint: 'Vidéo supprimée, lecteurs hors service' },
  { value: 'wrong_episode', label: 'Mauvais épisode ou mauvaise saison', hint: 'La vidéo ne correspond pas' },
  { value: 'wrong_info', label: 'Infos ou image incorrectes', hint: 'Titre, résumé, affiche, numérotation' },
  { value: 'other', label: 'Autre problème', hint: 'Précisez dans le commentaire' },
];
export const COMMENT_MAX = 500;
/** Même fenêtre que l'API : un appareil qui a signalé une cible la voit « déjà signalée » pendant 24 h. */
export const RECENT_MS = 24 * 60 * 60 * 1000;

export interface ReportTarget { animeId: string; episodeId?: string }
export interface ReportState {
  status: ReportStatus;
  reportedAt: string;
  processedAt?: string | null;
  result?: string | null;
  /** La cible attendait déjà son re-scrape (signalée par quelqu'un d'autre ou par cet appareil). */
  alreadyReported: boolean;
}

const API_BASE = (API_ADDRESS || 'http://localhost:3000').replace(/\/+$/, '');
const DEVICE_KEY = 'report.deviceId';
const LOCAL_KEY = 'report.recent';
const TIMEOUT_MS = 10000;

const numericId = (value?: string) => (value && /^\d+$/.test(value) ? Number(value) : null);
/** Seuls les identifiants de l'API (numériques) peuvent être signalés. */
export const canReport = (target: ReportTarget) => numericId(target.animeId) !== null && (target.episodeId === undefined || numericId(target.episodeId) !== null);
export const reportKey = (target: ReportTarget) => (target.episodeId ? `${target.animeId}:${target.episodeId}` : target.animeId);

export class ReportError extends Error {}

/** Texte montré quand la cible a déjà été signalée (par cet appareil ou par un autre). */
export function reportMessage(state: ReportState): { title: string; message: string } {
  switch (state.status) {
    case 'done':
      return { title: 'Déjà revérifié', message: `Ce contenu a été revérifié après un signalement récent${state.result ? ` (${state.result.toLowerCase()})` : ''}. Si le problème persiste, vous pourrez le signaler à nouveau demain.` };
    case 'failed':
      return { title: 'Déjà signalé', message: 'La revérification automatique n’a pas abouti : le signalement sera examiné à la main.' };
    case 'ignored':
      return { title: 'Déjà examiné', message: 'Ce signalement a déjà été examiné. Vous pourrez le signaler à nouveau demain si le problème persiste.' };
    default:
      return { title: 'Déjà signalé', message: 'Ce problème a déjà été signalé : on va revérifier très bientôt. Merci !' };
  }
}

/** Réponse de l'API (`data` de POST /api/report ou GET /api/report/status) → état affiché. */
export function parseReportState(data: any): ReportState | null {
  if (!data || data.reported === false || typeof data.status !== 'string') return null;
  return {
    status: data.status as ReportStatus,
    reportedAt: data.created_at || new Date().toISOString(),
    processedAt: data.processed_at ?? null,
    result: data.result ?? null,
    alreadyReported: data.already_reported !== false,
  };
}

type LocalReports = Record<string, { reportedAt: string }>;
/** Signalements de cet appareil encore récents (les plus vieux sont oubliés). */
export function pruneLocal(entries: LocalReports, now = Date.now()): LocalReports {
  return Object.fromEntries(Object.entries(entries).filter(([, entry]) => now - new Date(entry.reportedAt).getTime() < RECENT_MS));
}

async function readLocal(): Promise<LocalReports> {
  try { return pruneLocal(JSON.parse((await AsyncStorage.getItem(LOCAL_KEY)) || '{}')); } catch { return {}; }
}

async function rememberLocal(target: ReportTarget, reportedAt: string) {
  const entries = await readLocal();
  entries[reportKey(target)] = { reportedAt };
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(entries)).catch(() => {});
}

/** Identifiant aléatoire propre à l'installation (anti-spam côté API), sans lien avec l'appareil ou l'utilisateur. */
export async function getDeviceId(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(DEVICE_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
  } catch {}
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => {});
  return id;
}

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' } });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Signalement en cours ou récent de cette cible : l'API d'abord (elle connaît aussi ceux des autres appareils
 * et le résultat du re-scrape), sinon le souvenir local de cet appareil.
 */
export async function recentReport(target: ReportTarget): Promise<ReportState | null> {
  if (!canReport(target)) return null;
  try {
    const query = `anime_id=${target.animeId}${target.episodeId ? `&episode_id=${target.episodeId}` : ''}&device_id=${encodeURIComponent(await getDeviceId())}`;
    const { status, body } = await request(`/api/report/status?${query}`);
    if (status === 200) return parseReportState(body?.data);
  } catch {}
  const local = (await readLocal())[reportKey(target)];
  return local ? { status: 'pending', reportedAt: local.reportedAt, alreadyReported: true } : null;
}

/** Envoie le signalement ; lève une ReportError au message affichable si l'API le refuse ou est injoignable. */
export async function sendReport(target: ReportTarget, reason: ReportReason, comment = ''): Promise<ReportState> {
  const animeId = numericId(target.animeId);
  const episodeId = numericId(target.episodeId);
  if (animeId === null || (target.episodeId !== undefined && episodeId === null)) throw new ReportError('Ce contenu ne peut pas être signalé.');
  const text = comment.trim().slice(0, COMMENT_MAX);
  if (reason === 'other' && !text) throw new ReportError('Décrivez le problème en quelques mots.');
  let response: { status: number; body: any };
  try {
    response = await request('/api/report', {
      method: 'POST',
      body: JSON.stringify({ anime_id: animeId, ...(episodeId !== null ? { episode_id: episodeId } : {}), reason, ...(text ? { comment: text } : {}), device_id: await getDeviceId() }),
    });
  } catch {
    throw new ReportError('Signalement impossible : vérifiez votre connexion et réessayez.');
  }
  const { status, body } = response;
  if (status === 429) throw new ReportError('Trop de signalements envoyés depuis cet appareil. Réessayez plus tard.');
  if (status === 404) throw new ReportError('Ce contenu n’existe plus sur le serveur.');
  const state = status === 200 || status === 201 ? parseReportState(body?.data) : null;
  if (!state) throw new ReportError(typeof body?.message === 'string' && status === 400 ? body.message : 'Le signalement n’a pas pu être envoyé. Réessayez plus tard.');
  await rememberLocal(target, state.reportedAt);
  return state;
}
