/**
 * Vérification d'un APK téléchargé avant d'ouvrir l'installateur (logique pure, testée dans tests/).
 * Sources d'empreinte SHA-256, par ordre de préférence :
 * - le champ `digest` (« sha256:… ») que GitHub calcule pour chaque asset de release ;
 * - le fichier `<apk>.sha256` publié à côté de l'APK par scripts/publish-apk.cjs et le workflow.
 * Sans empreinte (anciennes releases), seule la taille est comparée.
 */
const SHA256 = /^[0-9a-f]{64}$/i;

/** Accepte « sha256:<hex> » ou un hexadécimal nu ; null pour tout autre format ou algorithme. */
export function parseSha256(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(?:sha-?256:)?([0-9a-f]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Lit l'empreinte d'un fichier au format `sha256sum` (« <hex>  nom ») ; avec `fileName`,
 * seule la ligne de ce fichier est retenue quand le nom est présent.
 */
export function extractSha256(text: string, fileName?: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const [hash, ...rest] = raw.trim().split(/\s+/);
    if (!hash || !SHA256.test(hash)) continue;
    const name = rest.join(' ').replace(/^\*/, '');
    if (fileName && name && name !== fileName) continue;
    return hash.toLowerCase();
  }
  return null;
}

export type ApkCheck =
  | { ok: true; method: 'sha256' | 'size' | 'none' }
  | { ok: false; reason: 'missing' | 'size' | 'sha256'; message: string };

export function checkApk(input: { expectedSize?: number; actualSize?: number | null; expectedSha256?: string | null; actualSha256?: string | null }): ApkCheck {
  const { expectedSize, actualSize, expectedSha256, actualSha256 } = input;
  if (actualSize == null || actualSize <= 0) return { ok: false, reason: 'missing', message: 'Le fichier téléchargé est vide ou introuvable' };
  if (expectedSize && expectedSize > 0 && actualSize !== expectedSize) {
    return { ok: false, reason: 'size', message: `Téléchargement incomplet (${actualSize} octets reçus sur ${expectedSize})` };
  }
  if (expectedSha256 && actualSha256) {
    if (expectedSha256.toLowerCase() !== actualSha256.toLowerCase()) return { ok: false, reason: 'sha256', message: 'Le fichier téléchargé est corrompu (empreinte SHA-256 différente)' };
    return { ok: true, method: 'sha256' };
  }
  return { ok: true, method: expectedSize && expectedSize > 0 ? 'size' : 'none' };
}
