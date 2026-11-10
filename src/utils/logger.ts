/**
 * Journal de l'app. `debug` et `info` ne sortent qu'en développement ; `warn` et `error`
 * sont toujours émis et gardés en mémoire (les plus récents) pour l'écran d'erreur et les paramètres.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  time: number;
  level: 'warn' | 'error';
  message: string;
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Tampon circulaire : au-delà de `capacity`, les entrées les plus anciennes sont écrasées. */
export class RingBuffer<T> {
  private items: T[] = [];
  private start = 0;
  constructor(readonly capacity: number) {
    if (!(capacity > 0)) throw new Error('capacity must be positive');
  }
  push(item: T) {
    if (this.items.length < this.capacity) this.items.push(item);
    else {
      this.items[this.start] = item;
      this.start = (this.start + 1) % this.capacity;
    }
  }
  /** Du plus ancien au plus récent. */
  toArray(): T[] {
    return [...this.items.slice(this.start), ...this.items.slice(0, this.start)];
  }
  clear() {
    this.items = [];
    this.start = 0;
  }
  get size() { return this.items.length; }
}

const MAX_ARG_LENGTH = 1000;

// Les erreurs natives ou venues d'un autre contexte ne passent pas toujours `instanceof Error`.
function isErrorLike(value: unknown): value is { name?: unknown; message: string; stack?: unknown } {
  if (value instanceof Error) return true;
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { message?: unknown }).message === 'string' && ('stack' in value || 'name' in value);
}

/** Texte lisible d'un argument de log, borné pour ne pas garder de gros objets en mémoire. */
export function formatArg(value: unknown): string {
  let text: string;
  if (typeof value === 'string') text = value;
  else if (isErrorLike(value)) {
    const stack = typeof value.stack === 'string' ? value.stack.split('\n').slice(1, 4).map(line => line.trim()).join(' | ') : '';
    text = `${typeof value.name === 'string' && value.name ? value.name : 'Error'}: ${value.message}${stack ? ` (${stack})` : ''}`;
  } else if (value === undefined) text = 'undefined';
  else {
    try { text = JSON.stringify(value) ?? String(value); } catch { text = String(value); }
  }
  return text.length > MAX_ARG_LENGTH ? `${text.slice(0, MAX_ARG_LENGTH)}…` : text;
}

const recent = new RingBuffer<LogEntry>(50);
const isDev = () => typeof __DEV__ !== 'undefined' && __DEV__;

function emit(level: LogLevel, prefix: string | undefined, args: unknown[]) {
  const values = prefix ? [`[${prefix}]`, ...args] : args;
  if (level === 'warn' || level === 'error') {
    recent.push({ time: Date.now(), level, message: values.map(formatArg).join(' ') });
    (level === 'warn' ? console.warn : console.error)(...values);
  } else if (isDev()) {
    (level === 'info' ? console.info : console.log)(...values);
  }
}

/** Journal avec un préfixe optionnel : `createLogger('Update').warn(...)` → « [Update] … ». */
export function createLogger(prefix?: string): Logger {
  return {
    debug: (...args) => emit('debug', prefix, args),
    info: (...args) => emit('info', prefix, args),
    warn: (...args) => emit('warn', prefix, args),
    error: (...args) => emit('error', prefix, args),
  };
}

export const logger = createLogger();

/** Avertissements et erreurs récents, du plus ancien au plus récent. */
export const getRecentErrors = () => recent.toArray();
export const clearRecentErrors = () => recent.clear();

/** Rapport texte des dernières erreurs, à copier ou partager. */
export function formatRecentErrors(entries: LogEntry[] = recent.toArray()): string {
  if (!entries.length) return 'Aucune erreur récente.';
  return entries.map(entry => `${new Date(entry.time).toISOString()} ${entry.level.toUpperCase()} ${entry.message}`).join('\n');
}
