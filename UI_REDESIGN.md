# Interface AnimeVision

La navigation conserve Accueil, Mes listes, Catalogue, Hors ligne, Paramètres et les fiches/lecteurs. L'interface partage désormais une palette violet/ivoire et un thème sombre cinéma. Le choix du thème dans les paramètres s'applique à toute l'application et persiste au redémarrage.

## Changements

- Accueil avec identité, sélection illustrée, bandeaux contrastés, cartes compactes et actualisation accessible aussi sur navigateur.
- Catalogue responsive de deux à six colonnes. Recherche, genres, années, studio, statut et tri sont traités par l'API sur tout le catalogue, avec pagination et protection contre les réponses obsolètes.
- Genres chargés depuis `/api/anime/genres`; les années remontent à 1960.
- Animations de révélation, pression, transitions et skeletons. La préférence système de réduction des animations désactive les mouvements et animations des fenêtres.
- Stockage local initialisé avant que les écrans consultent listes et historique. Les nombres PostgreSQL sont convertis explicitement; durée/année inconnues ne sont pas inventées.
- Lecteur navigateur dédié avec lecteurs intégrés, sélection de serveur et épisodes précédent/suivant. La version native garde `expo-video` et son téléchargement local.
- Support web de SQLite (WASM et en-têtes d'isolation dans Metro). Les appels de stockage disque natif sont évités sur navigateur; les téléchargements hors ligne restent disponibles sur mobile.

## Lancement

```sh
npm install
# Copier env.example vers .env et choisir l'adresse de l'API.
npm run web
```

`http://localhost:3000` convient au navigateur de la machine. Pour un téléphone, `API_ADDRESS` doit désigner l'adresse réseau de la machine qui héberge l'API. Relancer Metro après un changement de `.env`.

Pour héberger l'export web, servir les fichiers WASM et envoyer `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: credentialless`. Metro fournit déjà ces en-têtes en développement.

## Vérification

```sh
npm run typecheck
npm run export:web
npm run export:android
```

La vérification visuelle a couvert les tailles 390×844 et 1280×720, les thèmes clair/sombre, la recherche globale Naruto, les fiches/saisons de Frieren et le chargement d'un lecteur externe. Les exports vérifient les bundles; ils ne remplacent pas un test sur appareil Android/iOS. La disponibilité et la lecture des serveurs vidéo restent dépendantes des hébergeurs.
