# Composants tiers repris dans le code

## Mihon — logique du lecteur et reconnaissance des chapitres

- Projet : [mihonapp/mihon](https://github.com/mihonapp/mihon), licence **Apache 2.0**
  (copie : [`src/services/comics/mihon/LICENSE`](src/services/comics/mihon/LICENSE)). Le dépôt n'a pas de fichier NOTICE.
- Version : commit `524fa53043f2f5b2321ea13027e44f093ab4245c` (9 novembre 2026).

| Fichier ici | Origine dans Mihon | Adaptations |
|---|---|---|
| `src/services/comics/mihon/viewerNavigation.ts` | `app/src/main/java/eu/kanade/tachiyomi/ui/reader/viewer/ViewerNavigation.kt` et `viewer/navigation/{L,Kindlish,Edge,RightAndLeft,Disabled}Navigation.kt` | Kotlin → TypeScript ; classes remplacées par des tables de rectangles ; couleurs et ressources Android retirées ; point d'appui en fraction de l'écran. Rectangles, inversion et règle du sens droite→gauche inchangés. |
| `src/services/comics/mihon/chapterRecognition.ts` | `domain/src/main/java/tachiyomi/domain/chapter/service/ChapterRecognition.kt` | Kotlin → TypeScript ; seule la lecture d'un nom isolé est portée (`parseName`, `parseNumber`, `toDouble`, volume) ; le remplissage à partir de la liste entière (`fillChapterNumbers`) ne l'est pas ; lookbehind réécrit ; « tome » ajouté comme volume pour les noms de fichiers français. |

Non repris : les lecteurs de Mihon (`viewer/pager`, `viewer/webtoon`) reposent sur des vues Android (ViewPager,
RecyclerView, SubsamplingScaleImageView, Coil, Compose) et ne tournent pas sur Windows. Le lecteur de l'app reste
écrit en React Native (même code Android et Windows) et reprend les mêmes modes : page simple/double de gauche à
droite ou de droite à gauche, défilement vertical (webtoon), zoom, zones d'appui. Mihon ne fournit pas de catalogue :
les sources restent séparées dans `src/services/comics/`.

## pdf.js

- [mozilla/pdf.js](https://github.com/mozilla/pdf.js) via `pdfjs-dist` 6.4.299, licence **Apache 2.0**
  (copie : [`assets/pdfjs/LICENSE`](assets/pdfjs/LICENSE)). Fichiers `build/pdf.min.mjs` et `build/pdf.worker.min.mjs`
  copiés sans modification sous `assets/pdfjs/*.pdfjs` (extension changée pour que Metro les embarque comme ressources).
