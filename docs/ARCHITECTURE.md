# Choix d'architecture : conserver Expo

Décision du 12 octobre 2026 : conserver Expo/React Native pour cette refonte.

Le dépôt actuel est une application Android/iOS : lecture avec `expo-video`, stockage SQLite,
téléchargement de fichiers, notifications, orientation et navigation native. Le problème visible
venait de l'interface et de la chaîne de données. Ces corrections ne nécessitent pas de migration.
La nouvelle interface et ses animations sont désormais partagées entre le mobile et le navigateur.

Expo propose des composants natifs et peut intégrer des bibliothèques spécifiques à la plateforme.
Il prend également en charge un export web avec React Native Web :
[workflow Expo](https://docs.expo.dev/workflow/overview/),
[développement web](https://docs.expo.dev/workflow/web/).

Tauri utilise un cœur Rust et la WebView système : WebView2 sur Windows, WKWebView sur macOS
et WebKitGTK sur Linux. Cela présente un intérêt pour un client desktop léger, mais l'interface
React Native et les modules de téléchargement, vidéo, stockage et notification devraient être
adaptés. La réduction de taille d'un exécutable ne prouve pas que la lecture vidéo consommera
moins de mémoire : aucun benchmark comparatif n'a été effectué ici.
[Modèle de processus Tauri](https://v2.tauri.app/concept/process-model/).

Si le desktop devient la plateforme principale, réaliser un prototype Tauri distinct qui utilise
la même API. Mesurer ensuite le démarrage, la mémoire au repos et pendant la lecture, la fluidité,
le plein écran, les téléchargements et les codecs sur les OS ciblés, avant d'engager la migration.

Le scraper et PostgreSQL restent des services séparés de l'application. Leur disponibilité et
la cohérence de leur schéma sont nécessaires avec Expo comme avec Tauri.
