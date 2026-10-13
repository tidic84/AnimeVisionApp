# Interface inspirée des références Crunchyroll

Les captures fournies le 13 octobre 2026 servent de référence pour les espacements,
affiches, onglets et organisation des écrans. L'application garde le nom AnimeVision
et utilise les images et données de son catalogue.

- Fond noir par défaut, accent violet, affiches aux coins arrondis et navigation lisible.
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

Les rayons sont partagés dans `src/theme/shape.ts` : cartes à 12 px, champs à 16 px,
panneaux à 24 px, feuilles à 28 px et boutons principaux en forme de pilule.
Les vignettes et leurs superpositions sont découpées ensemble pour garder les mêmes coins.

## Fiche anime, lecteur et fluidité

La fiche propose les saisons réelles dans une feuille de sélection, un synopsis extensible,
des épisodes par groupes de 24, et un bouton fixe de lecture/reprise.
Les données SQLite de progression et de téléchargement sont préservées.

Le lecteur natif propose vidéo en portrait, plein écran paysage, pause, sauts de 10 secondes,
recherche dans la vidéo, vitesse et choix des sources. Le web conserve les commandes du
fournisseur intégré et utilise le plein écran du navigateur. Les iframes externes ne
permettent pas à AnimeVision de suivre leur progression. La lecture sur appareil reste
à vérifier avec les différents serveurs et les fichiers hors ligne.

Les skeletons partagent un reflet animé par transformations ; ils utilisent le moteur
natif sur mobile et passent au contenu par un fondu court. Leur hauteur est conservée
lors du changement de saison pour éviter un saut de défilement. Les changements d'onglet,
les fenêtres de sélection et les pressions utilisent des animations sobres ; la réduction
des mouvements est partagée et respectée. Aucun délai artificiel de chargement n'est ajouté.

Validation complémentaire : TypeScript, exports web/Android/iOS, sélection des saisons 1/2
des Carnets de l'Apothicaire, ouverture du lecteur intégré et entrée/sortie plein écran web.

## Chargement sans bloquer la navigation

Les cinq onglets sont montés dès le démarrage et restent accessibles pendant les requêtes,
y compris quand l'API est indisponible. SQLite s'initialise une seule fois ; ses lecteurs
attendent cette initialisation sans masquer toute l'application.

La file HTTP traite les vérifications système, puis les données de la page active, puis
les autres requêtes dans leur ordre d'arrivée. Deux requêtes au maximum sont actives,
avec une seule requête d'arrière-plan pour garder une place à la page ouverte.
Au changement de page, les requêtes de l'ancienne page peuvent libérer leur place,
puis reprendre automatiquement. Les requêtes identiques en attente sont partagées.

Validation : `node scripts/test-load-scheduler.cjs` (six scénarios) et navigation entre
les cinq onglets dans un navigateur avec des requêtes API retardées de dix secondes.
