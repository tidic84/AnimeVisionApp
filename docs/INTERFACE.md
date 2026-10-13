# Interface inspirée des références Crunchyroll

Les captures fournies le 13 octobre 2026 servent de référence pour les espacements,
affiches, onglets et organisation des écrans. L'application garde le nom AnimeVision
et utilise les images et données de son catalogue.

- Fond noir par défaut, accent orange, affiches rectangulaires et navigation lisible.
  Le thème clair reste disponible dans Mon compte.
- Accueil : grand carrousel, tendances, nouveaux épisodes, sélections par genre,
  reprise et Watchlist lorsqu'elles contiennent des éléments.
- Mes listes : Watchlist, collections SQLite éditables, historique avec reprise
  et suppression, téléchargements regroupés par anime.
- Naviguer : Tous les anime, Simulcast et Genres ; recherche, tri, filtres et pagination.
  Simulcast utilise le statut « en cours » de l'API et les années disponibles.
  L'API ne fournit pas de trimestre de diffusion permettant d'afficher une saison exacte.
- Mon compte : en-tête dégradé, pseudo enregistré sur l'appareil, réglages à séparateurs.
- Animations de transition, apparition et pression ; respect de la réduction des mouvements.

Les sections de jeux, de clips musicaux, de magasin et d'abonnement ne sont pas ajoutées.
Les préférences de lecture et de téléchargement existantes sont conservées ; leur prise
en charge dépend des lecteurs et serveurs utilisés. Le pseudo local ne crée pas de compte distant.
La gestion des téléchargements cible l'épisode et sa qualité exacte. Les transferts en
attente peuvent être annulés et les fichiers terminés supprimés. Le moteur HLS existant
ne permet pas d'interrompre un transfert actif ; cette action n'est donc pas proposée.

## Vérifications

TypeScript ; exports Expo web, Android et iOS ; affichage web à 390 × 844 ;
navigation des onglets ; création d'une collection ; édition du pseudo ; ajout à la Watchlist.
Les vérifications web utilisent un profil de navigateur temporaire.
Les exports natifs valident les bundles et ne remplacent pas un essai sur appareil.
