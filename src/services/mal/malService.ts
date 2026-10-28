/**
 * Client MyAnimeList : connexion OAuth 2 (PKCE, méthode "plain" imposée par MAL), jetons et API v2.
 *
 * L'URL de retour déclarée chez MAL est le relais de notre API (`/api/mal/callback`), fixe, qui
 * renvoie vers l'app (exp:// sous Expo Go, animevision:// en version compilée). L'échange du code
 * (et le rafraîchissement) passe par `/api/mal/token`, qui ajoute le client_secret de l'application
 * MAL ; les jetons sont ensuite conservés uniquement sur le téléphone (SecureStore).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { API_ADDRESS, MAL_CLIENT_ID } from '@env';

const AUTH_URL = 'https://myanimelist.net/v1/oauth2/authorize';
const API_BASE = (API_ADDRESS || 'http://localhost:3000').replace(/\/+$/, '');
const TOKEN_URL = `${API_BASE}/api/mal/token`;
const API_URL = 'https://api.myanimelist.net/v2';
const TOKENS_KEY = 'mal.tokens';
const USER_KEY = 'mal.user';

export type MalStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';
export interface MalListStatus { status: MalStatus; num_episodes_watched: number }
export interface MalListEntry { node: { id: number; title: string; num_episodes: number }; list_status: MalListStatus }
interface Tokens { access: string; refresh: string; expiresAt: number }

const clientId = () => (MAL_CLIENT_ID || '').trim();
export const isConfigured = () => clientId().length > 0;
/** URL à déclarer comme "App Redirect URL" sur https://myanimelist.net/apiconfig. */
export const redirectUri = () => `${API_BASE}/api/mal/callback`;

const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const randomString = (length: number) => Array.from(Crypto.getRandomBytes(length), byte => VERIFIER_CHARS[byte % VERIFIER_CHARS.length]).join('');
const base64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const form = (values: Record<string, string>) => Object.entries(values).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');

async function readTokens(): Promise<Tokens | null> {
  try { return JSON.parse((await SecureStore.getItemAsync(TOKENS_KEY)) || 'null'); } catch { return null; }
}

/** Échange via l'API : l'application MAL ("web") exige un client_secret qui ne doit pas être embarqué dans l'app. */
async function requestTokens(values: Record<string, string>): Promise<Tokens> {
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body.message || body.error_description || body.error || `MAL : HTTP ${response.status}`);
  const tokens = { access: body.access_token, refresh: body.refresh_token, expiresAt: Date.now() + Number(body.expires_in || 0) * 1000 };
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

/** Jeton valide, rafraîchi un jour avant expiration (les jetons MAL durent un mois). */
async function accessToken(force = false): Promise<string> {
  const tokens = await readTokens();
  if (!tokens) throw new Error('Compte MyAnimeList non connecté');
  if (!force && tokens.expiresAt - Date.now() > 24 * 60 * 60 * 1000) return tokens.access;
  return (await requestTokens({ grant_type: 'refresh_token', refresh_token: tokens.refresh })).access;
}

async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (response.status === 401 && retry) { await accessToken(true); return api(path, init, false); }
  if (!response.ok) throw new Error(`MAL ${path} : HTTP ${response.status}`);
  return response.json();
}

export async function getUser(): Promise<{ name: string } | null> {
  try { return JSON.parse((await AsyncStorage.getItem(USER_KEY)) || 'null'); } catch { return null; }
}

export async function isConnected(): Promise<boolean> {
  return Boolean(await readTokens());
}

interface AuthAnswer { code?: string | null; state?: string | null; error?: string | null }

/**
 * Ouvre la page MAL et attend le code. Deux voies : le lien profond (fiable en version compilée)
 * et l'API, qui garde le code reçu par le relais (le lien exp:// échoue sous Expo Go sur Android).
 */
async function waitForAuthorization(url: string, returnUrl: string, nonce: string): Promise<AuthAnswer> {
  let deepLink: AuthAnswer | null = null;
  let browserClosedAt = 0;
  void WebBrowser.openAuthSessionAsync(url, returnUrl).then(result => {
    if (result.type !== 'success') { browserClosedAt = Date.now(); return; }
    // Sous Expo Go (Android), un lien vers l'app sans code remonte dès l'ouverture de la page :
    // seul un retour portant un code ou une erreur MAL compte, sinon on continue d'attendre via l'API.
    const { queryParams } = Linking.parse(result.url);
    if (typeof queryParams?.code === 'string' || typeof queryParams?.error === 'string') {
      deepLink = { code: queryParams.code as string, state: queryParams.state as string, error: queryParams.error as string };
    }
  }, () => { browserClosedAt = Date.now(); });

  // Retour dans l'app sans code au bout de 20 s : la page MAL a été quittée sans connexion.
  let leftApp = false;
  let backInAppAt = 0;
  const subscription = AppState.addEventListener('change', status => {
    if (status !== 'active') leftApp = true;
    else if (leftApp) backInAppAt = Date.now();
  });

  try {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      if (deepLink) return deepLink;
      try {
        const response = await fetch(`${API_BASE}/api/mal/result/${nonce}`);
        if (response.ok) {
          // Ferme la page MAL si la plateforme le permet (sinon l'utilisateur la ferme lui-même).
          void Promise.resolve().then(() => WebBrowser.dismissBrowser()).catch(() => {});
          return await response.json();
        }
      } catch { /* API momentanément injoignable : on réessaie */ }
      const abandonedSince = Math.max(browserClosedAt, backInAppAt);
      if (abandonedSince && Date.now() - abandonedSince > (backInAppAt ? 20000 : 15000)) throw new Error('Connexion annulée');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw new Error('Connexion expirée, réessayez');
  } finally {
    subscription.remove();
  }
}

/** Ouvre la page de connexion MAL ; renvoie le nom du compte connecté. */
export async function connect(): Promise<string> {
  if (!isConfigured()) throw new Error('MAL_CLIENT_ID manquant dans le fichier .env de l’app');
  const verifier = randomString(96);
  const nonce = randomString(24);
  const returnUrl = Linking.createURL('mal');
  const state = base64url(JSON.stringify({ n: nonce, r: returnUrl }));
  const url = `${AUTH_URL}?${form({ response_type: 'code', client_id: clientId(), redirect_uri: redirectUri(), state, code_challenge: verifier, code_challenge_method: 'plain' })}`;

  const answer = await waitForAuthorization(url, returnUrl, nonce);
  if (answer.error) throw new Error(`MyAnimeList a refusé la connexion (${answer.error})`);
  if (answer.state !== state || typeof answer.code !== 'string') throw new Error('Réponse MyAnimeList invalide, réessayez');

  await requestTokens({ grant_type: 'authorization_code', code: answer.code, redirect_uri: redirectUri(), code_verifier: verifier });
  const me = await api<{ name: string }>('/users/@me');
  await AsyncStorage.setItem(USER_KEY, JSON.stringify({ name: me.name }));
  return me.name;
}

export async function disconnect(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKENS_KEY).catch(() => {});
  await AsyncStorage.removeItem(USER_KEY).catch(() => {});
}

/** Statut dans la liste de l'utilisateur (null si l'anime n'y est pas). */
export async function getListStatus(malId: number): Promise<MalListStatus | null> {
  const anime = await api<{ my_list_status?: MalListStatus }>(`/anime/${malId}?fields=my_list_status`);
  return anime.my_list_status ?? null;
}

export async function updateListStatus(malId: number, values: { status?: MalStatus; num_watched_episodes?: number }): Promise<void> {
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value !== undefined) body[key] = String(value);
  await api(`/anime/${malId}/my_list_status`, { method: 'PATCH', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) });
}

/** Liste complète de l'utilisateur (pagination MAL de 1000 entrées). */
export async function getUserList(): Promise<MalListEntry[]> {
  const entries: MalListEntry[] = [];
  let path: string | null = '/users/@me/animelist?fields=list_status,num_episodes&limit=1000&nsfw=true';
  while (path) {
    const page: { data: MalListEntry[]; paging?: { next?: string } } = await api(path);
    entries.push(...page.data);
    path = page.paging?.next ? page.paging.next.replace(API_URL, '') : null;
  }
  return entries;
}
