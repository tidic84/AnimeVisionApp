Je souhaite créer une application mobile React Native pour mon site https://anime-sama.fr/ qui héberge légalement des animés. L'application récupérera les données via scraping du site web.

## Architecture de l'application

### Navigation principale (5 onglets)
1. **Accueil** - Derniers épisodes et recommandations
2. **Mes Listes** - Gestion des listes personnalisées
3. **Catalogue** - Navigation et recherche d'animés
4. **Téléchargements** - Gestion du contenu hors-ligne
5. **Paramètres** - Configuration et synchronisation

## Fonctionnalités détaillées

### 1. Page d'Accueil
- **Section "Continuer à regarder"** : Reprise des animés en cours (ne pas afficher si vide)
- **Section "Derniers épisodes"** : Affichage des derniers épisodes ajoutés (scraping de la page d'accueil anime-sama.fr)
- **Section "Recommandés"** : Liste d'animés populaires et tendances
- Interface avec cards visuelles incluant miniatures et informations essentielles

### 2. Gestion des Listes
- **Liste par défaut** : "À regarder" (pré-créée)
- **Listes personnalisées** : Création, modification, suppression
- **Actions** : Ajouter/retirer des animés, réorganiser
- **Statuts** : En cours, Terminé, En pause, Abandonné

### 3. Catalogue et Recherche
- **Barre de recherche** : Recherche par titre, genre, année
- **Filtres avancés** : Genre, statut, année de sortie, studio
- **Tri** : Popularité, note, date d'ajout, alphabétique
- **Navigation** : Reproduction de la structure du catalogue anime-sama.fr

### 4. Page Détail d'un Animé
- **Informations** : Synopsis, genres, studio, année, note
- **Liste des épisodes** avec :
  - Image de preview
  - Titre et numéro d'épisode
  - Durée (affiché sur l'image en bas a droitee)
  - **États visuels** :
    - Non visionné : apparence normale
    - En cours : barre de progression superposée
    - Terminé : aspect grisé/marqué
- **Actions** : Ajouter aux listes, télécharger, partager

### 5. Lecteur Vidéo
- **Fonctionnalités** : Contrôles complets, qualité adaptative, double clique pour avancer reculer. Intégrer la possibilité de skip l'intro et l'outro (a partir de timestamp, mais je n'ai pas encore trouvé le moyen de détecter l'intro et l'outro)
- **Sauvegarde automatique** : Position de lecture
- **Navigation** : Passage automatique à l'épisode suivant (avec une option pour le désactiver)

### 6. Téléchargements
- **Gestion** : Téléchargement d'épisodes pour visionnage hors-ligne, Affichage du stockage occupé
- **Paramètres** : Qualité, espace de stockage, WiFi uniquement (paramétrable)
- **Organisation** : Par animé, tri par date

### 7. Paramètres et Synchronisation
- **Synchronisation MyAnimeList** : 
  - Authentification OAuth
  - Mise à jour automatique du progrès
  - Import/export des listes
- **Paramètres de lecture** : Qualité par défaut, sous-titres
- **Notifications** : Nouveaux épisodes, rappels
- **Thème** : Mode sombre/clair
- **Stockage** : Gestion du cache et des téléchargements

## Spécifications techniques
- **Framework** : React Native avec navigation par onglets
- **Scraping** : Mécanisme robuste avec gestion des erreurs
- **Stockage local** : SQLite pour les données utilisateur
- **Synchronisation** : API REST pour MyAnimeList
- **Performance** : Lazy loading, mise en cache intelligente
- **Compatibilité** : iOS et Android

## Interface utilisateur
- Design moderne et intuitif
- Animations fluides entre les écrans
- Gestion des états de chargement
- Interface responsive adaptée mobile et tablette