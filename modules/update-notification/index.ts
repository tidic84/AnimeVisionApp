import { requireOptionalNativeModule } from 'expo';

/**
 * Notification Android de téléchargement de la mise à jour, avec une vraie barre de progression
 * (NotificationCompat.setProgress, absent d'expo-notifications). Module local : null hors APK
 * (Expo Go, web, iOS), les appels deviennent alors sans effet.
 */
interface UpdateNotificationNative {
  /** `percent` < 0 : progression indéterminée. */
  progress(title: string, text: string, percent: number): void;
  /** Tap sur la notification : ouvre l'installateur sur `contentUri` (content://). */
  ready(title: string, text: string, contentUri: string): void;
  /** Tap sur la notification : rouvre l'app. */
  failed(title: string, text: string): void;
  cancel(): void;
}

const native = requireOptionalNativeModule<UpdateNotificationNative>('UpdateNotification');

function safely(action: (module: UpdateNotificationNative) => void) {
  if (!native) return;
  try { action(native); } catch { /* une notification ratée ne doit pas bloquer la mise à jour */ }
}

export const updateNotification = {
  available: !!native,
  progress: (title: string, text: string, percent: number) => safely(module => module.progress(title, text, Math.round(percent))),
  ready: (title: string, text: string, contentUri: string) => safely(module => module.ready(title, text, contentUri)),
  failed: (title: string, text: string) => safely(module => module.failed(title, text)),
  cancel: () => safely(module => module.cancel()),
};
