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
