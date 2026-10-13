# Migration Expo SDK 57

Migration du 13 octobre 2026 depuis SDK 53 vers Expo `57.0.28`, React Native `0.86.3` et React `19.2.3`.

## Changements

- Dépendances Expo et bibliothèques natives alignées avec `expo install --fix`.
- Reanimated 4.5 et Worklets 0.10 installés ensemble ; le preset Expo configure leur transformation Babel.
- Téléchargements et lecture hors ligne conservés avec l'import explicite `expo-file-system/legacy`.
- `VideoView.fullscreenOptions` remplace `allowsFullscreen`.
- Splash migré vers le plugin `expo-splash-screen`; options obsolètes `newArchEnabled` et `edgeToEdgeEnabled` retirées.
- Thème normalisé quand React Native retourne `unspecified`, types de timers adaptés, dépendance `buffer` déclarée.
- Anciennes dépendances inutilisées supprimées, notamment `expo-av`, les anciens paquets AsyncStorage et le carrousel non utilisé.
- Les deux anciens fichiers de workspace Xcode, sans Podfile ni projet natif complet, sont retirés.
  Android et iOS sont générés depuis `app.json` avec Expo Prebuild/Continuous Native Generation.

## Installation et test local

```sh
npm ci
npm run typecheck
npx expo-doctor
npm run export:web
npm run export:android
npx expo start --go --lan --port 8081
```

L'environnement local conserve `API_ADDRESS=http://192.168.10.139:3000`.
L'adresse Expo reste `exp://192.168.10.139:8081`, avec le même QR code.
Utiliser Expo Go compatible SDK 57 ; une ancienne version SDK 53 ne peut pas ouvrir ce projet.

Pour une compilation native, générer les projets avec `npx expo prebuild`, puis compiler sur les outils
Android/iOS appropriés ou avec EAS Build. L'export Android vérifie le bundle Hermes, pas un APK signé.
La compilation iOS nécessite macOS/Xcode ou un build distant.

## Validation

- Expo Doctor : 21/21 contrôles.
- Vérification TypeScript.
- Exports web et Android.
- Manifest LAN : `exposdk:57.0.0`; API accessible sur le réseau local.
- Vérification du rendu web et des données réelles.

## Références

- [Guide de migration](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [SDK 57](https://expo.dev/changelog/sdk-57)
- [FileSystem legacy](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/)
- [Lecteur vidéo](https://docs.expo.dev/versions/v57.0.0/sdk/video/)
- [Expo Go SDK 57](https://expo.dev/go?sdkVersion=57&platform=android&device=true)
