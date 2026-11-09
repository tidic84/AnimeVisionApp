import AsyncStorage from '@react-native-async-storage/async-storage';

export const LANGUAGE_OPTIONS = [
  { value: 'vostfr', label: 'VOSTFR (sous-titré)' },
  { value: 'vf', label: 'VF (doublé)' },
];

/** Version audio préférée, enregistrée par l'écran Paramètres dans `appSettings`. */
export async function getPreferredLanguage(): Promise<string> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem('appSettings')) || '{}');
    return typeof saved.preferredLanguage === 'string' ? saved.preferredLanguage : 'vostfr';
  } catch {
    return 'vostfr';
  }
}

/** Hébergeurs favoris dans l'ordre de préférence (identifiants de `STREAM_HOSTS`), enregistrés dans `appSettings`. */
export async function getFavoriteHosts(): Promise<string[]> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem('appSettings')) || '{}');
    return Array.isArray(saved.favoriteHosts) ? saved.favoriteHosts.filter((value: unknown) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}
