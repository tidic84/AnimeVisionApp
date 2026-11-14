# AnimeVision - Application Mobile React Native

Application mobile React Native (Expo) pour regarder des animés, avec gestion de listes,
historique de visionnage et téléchargements hors ligne. Le catalogue, les épisodes et les
lecteurs proviennent de l'API AnimeVisionAPI ; l'application n'embarque aucun scraping.

## 🔄 Données

```
Écrans → apiService → AnimeVisionAPI (API_ADDRESS)
   ↓
databaseService (SQLite local) : listes, historique, téléchargements
```

Si l'API est injoignable, les écrans affichent leur message d'erreur et les épisodes
téléchargés restent accessibles.

## 💻 Version Windows (10 et 11)

L'application Windows réutilise tout le code de l'app : l'export web Expo (`dist-web`, React Native Web)
est affiché dans une fenêtre [Electron](https://www.electronjs.org/) (dossier `desktop/`). Ce choix évite
de réécrire l'interface et suit le chemin web déjà présent (lecteur `VideoPlayerScreen.web.tsx`, SQLite web).
Electron embarque Chromium, donc les codecs, le plein écran et SharedArrayBuffer sont les mêmes sur tous les PC.
La coque (`desktop/main.cjs`) sert l'export sous `app://animevision`, applique l'isolation cross-origin requise par
SQLite, autorise l'origine de l'app auprès de l'API et de MangaDex, ouvre les liens externes dans le navigateur
et bloque les pop-up publicitaires des lecteurs.

```powershell
npm install                      # dépendances de l'app
npm --prefix desktop install     # Electron + electron-builder (une fois)
npm run desktop:build            # export web + installateur NSIS
# -> dist-desktop\AnimeVision-Setup-<version>.exe  (version = app.json)
npm run desktop                  # lance la coque sur le dernier export (dist-web), sans installer
npm run desktop:dev              # coque branchée sur `npx expo start --web` (port 8081)
```

`.env` (API_ADDRESS, MAL_CLIENT_ID) est lu à l'export : le refaire après une modification.
L'installateur n'est pas signé : Windows SmartScreen affiche un avertissement au premier lancement
(« Informations complémentaires » > « Exécuter quand même »). Le workflow de release le construit aussi
(job `windows`) et l'attache à la release GitHub, à côté de l'APK.

Sur grand écran (≥ 1024 px), les onglets passent dans une barre latérale.
Raccourcis : F11 plein écran, F5/Ctrl+R recharger ; ceux du lecteur de scans sont listés dans ses réglages.

## 📚 Scans : mangas, manhwas et fichiers

Onglet **Scans** (à côté d'**Animes**) : filtres *Tous*, *Mangas*, *Manhwas*, *Manhuas* et *Ma bibliothèque*.

**Taille du catalogue (chiffres annoncés par MangaDex le 11/11/2026, une œuvre comptée une fois quelles que
soient ses traductions)** : 3 844 mangas et 1 023 manhwas avec des chapitres en français ; 42 176 mangas et
5 684 manhwas dans au moins une langue. L'app affiche ces nombres en direct en haut du catalogue. Aucune
comparaison chiffrée avec Scan-Manga n'est possible : ce site ne publie ni son catalogue ni d'API, et ses scans
ne sont pas une source autorisée. Webtoon, MANGA Plus et Mangas.io n'offrent pas d'API ouverte aux applications
tierces ; Comick a fermé fin 2025. Pour aller au-delà de MangaDex : votre propre serveur OPDS (voir plus bas).

- **Source en ligne : [MangaDex](https://api.mangadex.org/docs/)**, qui fournit à la fois les métadonnées
  (titres, résumés, genres, statut, couvertures) et l'accès aux pages des chapitres (serveurs MangaDex@Home).
  Ses conditions autorisent les applications tierces non commerciales : citer MangaDex et les équipes de
  traduction (fait dans la fiche et le lecteur), aucune publicité ni service payant, User-Agent réel,
  ~5 requêtes/s. Aucune clé ni compte n'est nécessaire. Les chapitres retirés à la demande d'un éditeur ou
  hébergés chez lui sont signalés « Indisponible » ou « Lecture chez l'éditeur ».
  Mangas = titres d'origine japonaise ; manhwas = titres d'origine coréenne ; manhuas = titres d'origine chinoise
  (chinois simplifié et traditionnel). *Tous* inclut les trois, en conservant la langue de traduction choisie.
- **Parcours complet** : « Toutes les langues » retire le filtre de traduction ; MangaDex refuse d'aller au-delà de
  10 000 résultats par tri, donc « Catalogue complet » avance par date d'ajout (`createdAtSince`), sans limite.
- **Serveurs OPDS** (*Ma bibliothèque* > « + Serveur OPDS ») : Komga, Kavita, Codex, ComicOPDS… Votre bibliothèque est
  lue page par page via l'extension OPDS-PSE (`src/services/comics/opds.ts`, `opdsFeed.ts`). Identifiants vérifiés
  avant enregistrement ; mot de passe dans le stockage sécurisé sur Android, dans le stockage de l'app sur Windows ;
  envoyés uniquement à l'adresse du serveur. Testé avec Komga 1.29.1 ; Kavita et les autres non testés.
  Komga ne fournit pas de couverture dans sa liste de séries OPDS (couverture visible sur la fiche).
- **Doublons** : une recherche interroge aussi la bibliothèque ; une même œuvre trouvée dans plusieurs sources forme
  une seule carte (« MangaDex + Maison »). Règle prudente (`duplicates.ts`) : titre identique après normalisation, jamais
  deux fiches d'une même source. La fiche liste les autres sources (« Aussi disponible ») avec leur dernier chapitre.
- **Langues** : une langue préférée globale (en-tête du catalogue) et une langue retenue par titre (fiche ou
  lecteur). La fiche ne propose que les langues vérifiées : pour chacune, une requête compte les chapitres
  réellement lisibles (`includeExternalUrl=0&includeEmptyPages=0`) et donne le plus récent — la liste
  `availableTranslatedLanguages` de MangaDex annonce parfois des langues sans aucun chapitre lisible.
  Il s'agit de traductions publiées par des équipes ; l'app ne traduit jamais les images. La langue ne change
  jamais sans action de l'utilisateur.
- **Continuité entre traductions** : la position est gardée par titre, source et langue (`comicPositions`).
  En changeant de langue (fiche : « Continuer en … au chapitre équivalent » ; lecteur : réglages > langue),
  `chapterMatch.ts` cherche le même numéro. Volume différent, chapitre découpé (12 → 12.1/12.2), bonus (12.5),
  one-shot ou chapitre absent : la correspondance est déclarée incertaine, la raison est affichée et
  l'utilisateur choisit. Le chapitre choisi s'ouvre à la première page (pas de transfert de page).
- **En cours** : appui long ou bouton ⋯ sur une vignette (ou bouton de la fiche) pour retirer un titre,
  « Sélectionner » pour en retirer plusieurs, puis « Annuler » pendant quelques secondes. Le retrait garde
  favoris, progression et fichiers importés (table `comicHidden`) ; relire le titre le fait réapparaître.
  « Réinitialiser la progression » (avec confirmation) efface positions et chapitres lus, toutes langues.
  Les chapitres MangaDex ne sont pas téléchargés : la seule donnée hors ligne est un fichier importé,
  supprimable depuis sa fiche (« Supprimer le fichier », avec confirmation).
- **Fichiers locaux** : import de CBZ, de ZIP d'images et de PDF. Les pages sont extraites une fois
  (fichiers de l'app sur Android, IndexedDB sur Windows) et restent lisibles hors connexion. Les PDF sont
  rendus avec pdf.js (`assets/pdfjs`, licence Apache 2.0), dans une WebView invisible sur Android. Le numéro
  de chapitre ou de tome est lu dans le nom du fichier.
- Les sources sont isolées dans `src/services/comics/` : chaque source implémente `ComicProvider` (`types.ts`)
  et s'enregistre dans `index.ts`.
- **Lecteur** (commun aux mangas, manhwas et fichiers, Android et Windows) : page simple, double page ou
  défilement vertical ; sens droite→gauche (défaut des mangas) ou gauche→droite ; ajustement à la hauteur ou à
  la largeur ; zoom ; largeur de lecture réglable sur PC ; zones d'appui au choix. Mode par défaut selon le
  type (page par page pour un manga, vertical pour un manhwa), modifiable et mémorisé par type.
  Les images sont chargées au fil de la lecture (liste virtualisée, page suivante préchargée).
- **Code repris de Mihon** (Apache 2.0, commit `524fa53`) : zones d'appui et reconnaissance des numéros de
  chapitre, portées en TypeScript dans `src/services/comics/mihon/`. Les lecteurs de Mihon dépendent des vues
  Android et ne sont pas réutilisables sur Windows. Détails : [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- Les flux Komga réels servant aux tests sont dans `tests/fixtures/opds-komga-*.xml`.
- Favoris, « En cours », chapitres lus et position exacte (page + partie défilée) sont stockés dans SQLite
  (`comicFavorites`, `comicPositions`, `comicHidden`, `comicReadChapters`) et partagés par toutes les sources.

## 📦 APK Android et mises à jour

Chaque tag `vX.Y.Z` lance le workflow `.github/workflows/release.yml` : il construit l'APK signé
et le publie dans une [release GitHub](https://github.com/tidic84/AnimeVisionApp/releases).

```powershell
npm run release            # 1.0.0 -> 1.0.1 (ou : minor, major, 1.4.0)
gh run watch -R tidic84/AnimeVisionApp
```

Sans GitHub Actions, `npm run release -- patch --local` construit l'APK sur ce poste
(SDK Android et JDK de `~/tools`, copie dans `C:\av` pour éviter la limite de chemin
de Windows) puis l'attache à la release. Pour un tag déjà poussé :
`node scripts/publish-apk.cjs`.

L'app installée vérifie la dernière release au démarrage (au plus toutes les 6 h) et propose
de télécharger puis d'installer l'APK. Paramètres > À propos > « Rechercher une mise à jour »
force la vérification. Expo Go et le web ne s'auto-mettent pas à jour.

Le workflow utilise ces réglages du dépôt :
- variables `API_ADDRESS` (adresse de l'API intégrée à l'APK) et `ANDROID_KEY_ALIAS` ;
- secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `MAL_CLIENT_ID`.

La clé de signature est conservée hors du dépôt (`~/.android-keys/animevision-release.jks`).
Sans elle, une nouvelle version ne peut plus s'installer par-dessus l'ancienne : la sauvegarder.

## 🎮 Test de l'Application

1. Démarrez l'API AnimeVisionAPI (voir [`readme-api.md`](docs/readme-api.md))
2. Lancez `npx expo start`
3. Scannez le QR code avec Expo Go

### Structure du Projet
```
src/
├── components/   # Composants réutilisables (AnimeCard, EpisodeCard, Dialog…)
├── contexts/     # Thème et disponibilité de l'API
├── navigation/   # Configuration de navigation
├── screens/      # Écrans (Home, AnimeDetail, Catalog, Lists, Planning, Downloads, Settings, VideoPlayer)
├── services/     # apiService, databaseService, téléchargements, extraction vidéo, MyAnimeList
├── theme/        # Palette et formes
├── types/        # Types TypeScript
└── utils/        # Utilitaires
```

## 🛠 Architecture Technique

### Technologies Utilisées
- **React Native** avec Expo SDK 58
- **TypeScript** pour la sécurité des types
- **React Navigation** pour la navigation
- **SQLite** (expo-sqlite) pour le stockage local
- **expo-video** pour la lecture vidéo
- **Expo Screen Orientation** pour la gestion de l'orientation

## ⚙️ Configuration

### Configuration de l'API

L'application utilise la variable d'environnement `API_ADDRESS` pour se connecter à l'API AnimeVisionAPI.

**Configuration via app.json :**
```json
{
  "expo": {
    "extra": {
      "API_ADDRESS": "http://votre-serveur:8001"
    }
  }
}
```

**Exemples de configuration :**
- **Local :** `http://localhost:8001`
- **Réseau :** `http://192.168.1.100:8001` 
- **Production :** `https://api.tidic.fr`

📋 Consultez [`CONFIG.md`](docs/CONFIG.md) pour la documentation complète de configuration.

📋 Consultez [`readme-api.md`](docs/readme-api.md) pour la documentation de l'API AnimeVisionAPI.

## 📱 Installation et Développement

### Prérequis
- Node.js 16+
- npm ou yarn
- Expo CLI
- Émulateur Android/iOS ou appareil physique
- **API AnimeVisionAPI** en cours d'exécution (voir docs/readme-api.md)

### Installation
```bash
# Cloner le projet
git clone <repository-url>
cd AnimeVisionApp

# Installer les dépendances
npm install

# Démarrer en mode développement
npx expo start
```

### Scripts Disponibles
```bash
npm run android    # Lancer sur Android
npm run ios        # Lancer sur iOS (macOS requis)
npm run web        # Lancer sur navigateur web
npm run start      # Démarrer Expo
```

### Variables d'Environnement
Voir [`env.example`](env.example) : copier vers `.env`, puis renseigner `API_ADDRESS`
et, pour la synchronisation MyAnimeList, `MAL_CLIENT_ID`.

## 🎨 Interface Utilisateur

### Design System
- **Couleurs** : Palette moderne avec support du mode sombre
- **Typographie** : Hiérarchie claire et lisible
- **Espacement** : Grille cohérente de 8px
- **Animations** : Transitions fluides et naturelles
- **Composants** : Cards modulaires avec données réelles

## 🔒 Confidentialité

### Données Personnelles
- Stockage local uniquement (SQLite)
- Aucune collecte de données personnelles
- Synchronisation optionnelle via MyAnimeList

## 🐛 Débogage

```bash
# Redémarrer Expo en vidant le cache Metro
npx expo start --clear
```

L'adresse de l'API utilisée est affichée au démarrage dans les logs (`[ApiService]`).

## 🛣️ Roadmap

Voir [`docs/roadmap.md`](docs/roadmap.md).

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier LICENSE pour plus de détails.

## 🤝 Contribution

Les contributions sont les bienvenues ! Merci de :
1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📞 Support

Pour toute question ou problème :
- Ouvrir une issue sur GitHub
- Vérifier les logs de développement

---

**Note** : Cette application est un client de l'API AnimeVisionAPI et n'héberge aucun contenu.

## Source Scan-Manga

Le catalogue propose désormais MangaDex, Scan-Manga ou une recherche sur les deux sources.
Sur Windows, le catalogue démarre automatiquement avec AnimeVision, via son navigateur Chromium isolé. Il importe le classement et les nouveautés, puis vérifie les publications toutes les 30 minutes tant que l’application est ouverte. Les fiches et chapitres utilisent les écrans natifs. Les données et pages en cache restent dans le dossier utilisateur de l’application.
Sur Android et sur le web, un service accessible reste nécessaire : voir `catalog-server/README.md`.
La recherche porte sur les œuvres effectivement indexées, pas sur la totalité du site. Sur Windows, aucune adresse n’est à saisir. Pour un serveur externe, configurer l’adresse dans **Scans > Scan-Manga > Configurer**. Les erreurs du collecteur et la dernière synchronisation sont affichées.
Une vérification du site peut nécessiter une intervention manuelle dans le navigateur du service.
