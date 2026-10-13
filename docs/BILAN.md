# Bilan vérifié — 12 octobre 2026

## Interface

Refonte des écrans et composants avec une palette commune, thèmes clair/sombre persistants,
accueil illustré, catalogue responsive et animations compatibles avec la réduction des mouvements.
Navigation et fonctions mobiles conservées. Recherche et filtres exécutés sur toute la base.
Le navigateur dispose désormais d'un lecteur dédié, avec choix du serveur et navigation entre épisodes.

## Données existantes réparées

| Mesure | Avant | Après |
| --- | ---: | ---: |
| Animés en base | 1 536 | 1 577 |
| Titres vides | 1 312 | 0 |
| Affiches manquantes | 348 | 0 |
| Bannières manquantes | 348 | 0 |
| Saisons | 2 798 | 2 850 |
| Épisodes | 38 675 | 38 920 |
| Épisodes avec au moins un serveur référencé | — | 38 920 |
| Saisons avec année et statut connus | 2 | 1 168 |

Le catalogue actuel comprend 1 575 fiches uniques sur 33 pages. Les deux fiches historiques
supplémentaires restent conservées en base. 41 fiches absentes ont été importées avec leurs données.
Le flux des nouveautés retourne 30 épisodes récents.

1 291 fiches ont été enrichies depuis des identifiants AniList vérifiés. 22 correspondances
ambiguës ont été ignorées. Les genres ont été harmonisés, les véritables URL d'affiches récupérées,
et les dates/statuts de première saison complétés. Les titres et captures d'épisodes spécifiques
nécessitent des données disponibles chez les fournisseurs ; une bannière sert de remplacement
visuel quand une capture manque.

Sept séries ont été rescrapées, enrichies et enregistrées via Prisma sur la base réelle :
Frieren, Solo Leveling, Dandadan, Spy X Family, Jujutsu Kaisen, Demon Slayer et Solar Opposites.
Cela a traité 28 saisons et 323 épisodes sans erreur. Les identifiants des fiches existantes restent stables.
Les sauvegardes des opérations de réparation sont dans `AnimeVisionScraper/data/`.

## Corrections de fonctionnement

- Domaine source configurable, désormais `anime-sama.to`, et sélecteurs adaptés au HTML actuel.
- Extraction des tableaux JavaScript sans exécuter leur contenu ; positions vides conservées.
- Regroupement des langues, conservation distincte des films, parties et versions alternatives.
- Conservation des fiches à travers les changements de domaine source.
- Schéma partagé API/scraper : genres `TEXT[]`, identifiants AniList/TMDB, contenus JSON des serveurs.
- Suppression de la limite implicite de 48 fiches, respect de `MAX_ANIME_PER_CYCLE=0`.
- Métadonnées longues conservées avec une migration `TEXT`, plutôt que tronquées.
- Respect des délais AniList après un HTTP 429 ; conservation des données source en cas d'enrichissement indisponible.
- Routes `/genres`, `/stats` et `/continue-watching` accessibles, paramètres SQL corrigés.
- Recherche globale, filtres combinables et tri paginé ; fiches sans note également visibles.
- Démarrage Docker corrigé, client Prisma généré avant compilation et Chromium système utilisé.

## Vérifications

- Tests du scraper : parsing des serveurs, positions vides, langues/versions, domaines et mauvaises correspondances de titres.
- Compilation TypeScript et génération Prisma réussies.
- Tests API : 25 routes/requêtes exécutées sur le schéma réel avec PostgreSQL WASM, filtres combinés et variantes de langue.
- Connexion Prisma et API à la base existante vérifiées ; filtre année 2023 : 112 résultats, statut terminé : 1 154 résultats.
- TypeScript de l'app et exports Expo web/Android réussis.
- Parcours web : accueil, catalogue, recherche, fiche, lecteur, thèmes, tailles 390×844 et 1280×720.

Les exports ne constituent pas un test sur téléphone physique. L'accès SSH à `192.168.10.182:22`
reste indisponible ; les changements de code n'ont pas été déployés sur cette machine ni poussés sur GitHub.
Les réparations de données ont toutefois été appliquées à la base existante via ses identifiants locaux.
Docker n'a pas été exécuté sur ce poste. La présence d'un lien vidéo ne garantit pas que l'hébergeur
le diffuse actuellement : les lecteurs externes doivent rester interchangeables.

Voir [l'aperçu](http://localhost:8081) et [la décision Expo/Tauri](ARCHITECTURE.md).
