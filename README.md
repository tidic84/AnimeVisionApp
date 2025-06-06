# AnimeVision - Application Mobile React Native

Une application mobile React Native complète pour regarder des animés depuis anime-sama.fr avec des fonctionnalités avancées de gestion et de téléchargement.

## 🚧 État Actuel du Projet

**Version :** 1.2.0 (Scraping Réel Implémenté)
**Statut :** ✅ Application complète avec scraping d'anime-sama.fr

### ✅ Fonctionnalités Implémentées

#### Interface Utilisateur (v1.1.0)
- ✅ Architecture complète de l'application
- ✅ Navigation entre 5 onglets principaux
- ✅ **Écran d'accueil interactif** avec sections dynamiques
- ✅ **Écran de détails d'animé** complet avec synopsis, genres et épisodes
- ✅ **Lecteur vidéo fonctionnel** avec expo-av et contrôles avancés
- ✅ Base de données SQLite fonctionnelle
- ✅ Interface utilisateur moderne avec thème sombre/clair
- ✅ **Composants réutilisables** (AnimeCard, EpisodeCard)
- ✅ Navigation fluide entre tous les écrans

#### Scraping Réel (v1.2.0) 🆕
- ✅ **Service de scraping complet** pour anime-sama.fr
- ✅ **Extraction automatique des données** depuis le site officiel
- ✅ **Cache intelligent** avec expiration automatique (30min)
- ✅ **Système de retry** avec délai exponentiel
- ✅ **Gestion des erreurs** avec fallback automatique
- ✅ **Parsing des derniers épisodes** depuis la page d'accueil
- ✅ **Extraction des détails d'animés** (titre, synopsis, genres)
- ✅ **Gestion des images** depuis le CDN officiel
- ✅ **Interface unifiée** entre données réelles et mockées

### 🔄 Système de Scraping

#### **Architecture du Scraping**
```
Interface Utilisateur → animeSamaService → animeSamaScrapingService → anime-sama.fr
                                     ↓
                              Cache + Fallback
                                     ↓
                            Base de Données Locale
```

#### **Données Extraites en Temps Réel**
- **Page d'accueil** : Section "Derniers épisodes ajoutés"
- **Catalogue** : Section "Les classiques" et "Découvrez des pépites"
- **Détails d'animé** : Titre, synopsis, genres depuis les pages officielles
- **Images** : CDN `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/`

#### **Fonctionnalités Avancées**
- **Cache intelligent** : 30min pour détails, 10min pour épisodes
- **Retry automatique** : 3 tentatives avec délai exponentiel
- **Fallback robuste** : Données mockées si scraping échoue
- **Gestion CORS** : Support des restrictions en développement

### 🎯 Nouvelles Fonctionnalités (v1.2.0)

#### **Scraping en Temps Réel**
- Navigation vers des vrais animés d'anime-sama.fr
- Données extraites automatiquement du site officiel
- Images chargées depuis le CDN officiel
- Informations synchronisées avec le site source

#### **Interface de Gestion**
```typescript
// Basculer entre scraping réel et données de test
animeSamaService.enableRealScraping();   // 🆕 Scraping activé
animeSamaService.disableRealScraping();  // Données mockées

// Statistiques du cache
console.log(animeSamaService.getCacheStats()); // 🆕 Monitoring
```

### 🔄 Prochaines Étapes

1. **Extraction URLs de Streaming** 🔄 En cours
   - Analyse des lecteurs embarqués d'anime-sama.fr
   - Support des différentes qualités (480p, 720p, 1080p)
   - Gestion des serveurs multiples

2. **Développer les écrans restants** 📋 Planifié
   - Écran Catalogue avec recherche avancée
   - Écran Listes avec gestion personnalisée
   - Écran Téléchargements hors-ligne
   - Écran Paramètres complet

3. **Fonctionnalités avancées** 📋 Planifié
   - Synchronisation MyAnimeList
   - Notifications push pour nouveaux épisodes
   - Système de téléchargements hors-ligne

## 🎮 Test de l'Application

### Comment Tester le Scraping Réel
1. Lancez `npx expo start`
2. Scannez le QR code avec Expo Go
3. **Testez les données réelles** :
   - Page d'accueil → Vrais derniers épisodes d'anime-sama.fr
   - Cliquez sur un animé → Vraies informations extraites
   - Navigation complète avec données actualisées

### Fonctionnalités Testables
- ✅ **Scraping en temps réel** depuis anime-sama.fr
- ✅ **Cache automatique** des données extraites
- ✅ **Fallback intelligent** si erreur réseau
- ✅ Navigation entre écrans avec vraies données
- ✅ Images chargées depuis le CDN officiel
- ✅ Interface responsive et moderne

### Débuggage du Scraping
```typescript
// Voir les logs de scraping dans la console
import { logScrapingAttempt } from './src/utils/scrapingUtils';

// Vérifier le cache
console.log(animeSamaService.getCacheStats());

// Forcer le rechargement
animeSamaService.clearCache();
```

## 🔍 Documentation Technique

### Scraping d'Anime-Sama.fr
Consultez [`SCRAPING.md`](./SCRAPING.md) pour la documentation complète :
- Architecture détaillée du système
- Patterns d'extraction utilisés
- Gestion des erreurs et cache
- Configuration et test
- Considérations légales

### Structure du Projet
```
src/
├── components/          # ✅ Composants réutilisables
│   ├── AnimeCard/       # ✅ Card d'animé modulaire
│   ├── EpisodeCard/     # ✅ Card d'épisode avec progression
│   └── index.ts         # ✅ Exports centralisés
├── screens/            # Écrans de l'application
│   ├── Home/           # ✅ Page d'accueil avec données réelles
│   ├── AnimeDetail/    # ✅ Détails d'animé scrapés
│   ├── VideoPlayer/    # ✅ Lecteur vidéo fonctionnel
│   ├── Lists/          # 🔄 Gestion des listes (structure)
│   ├── Catalog/        # 🔄 Catalogue et recherche (structure)
│   ├── Downloads/      # 🔄 Téléchargements (structure)
│   └── Settings/       # 🔄 Paramètres (structure)
├── services/           # Services métier
│   ├── animeSamaService.ts         # ✅ Interface unifiée
│   ├── animeSamaScrapingService.ts # ✅ 🆕 Scraping réel
│   └── databaseService.ts          # ✅ Gestion SQLite
├── utils/              # 🆕 Utilitaires
│   └── scrapingUtils.ts # ✅ Outils de scraping et debug
├── types/             # ✅ Types TypeScript complets
└── navigation/        # ✅ Configuration de navigation
```

## 🛠 Architecture Technique

### Technologies Utilisées
- **React Native** avec Expo SDK 53
- **TypeScript** pour la sécurité des types
- **React Navigation** pour la navigation
- **SQLite** (expo-sqlite) pour le stockage local
- **Expo AV** pour la lecture vidéo
- **Expo Screen Orientation** pour la gestion de l'orientation
- **Axios** pour les requêtes HTTP et scraping 🆕

### Services Principaux

#### AnimeSamaService ✅
- ✅ Interface unifiée pour données réelles et mockées
- ✅ Basculement intelligent entre scraping et fallback
- ✅ Configuration centralisée du cache

#### AnimeSamaScrapingService ✅ 🆕
- ✅ Scraping complet d'anime-sama.fr
- ✅ Parsing HTML avec regex optimisées
- ✅ Cache intelligent avec expiration
- ✅ Retry automatique et gestion d'erreurs
- ✅ Extraction automatique des images CDN

#### DatabaseService ✅
- ✅ Base de données SQLite complète
- ✅ Gestion des animés, épisodes, listes
- ✅ Historique de visionnage
- ✅ Synchronisation des données scrapées

## 📱 Installation et Développement

### Prérequis
- Node.js 16+
- npm ou yarn
- Expo CLI
- Émulateur Android/iOS ou appareil physique

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

### Configuration du Scraping
```typescript
// Activer le scraping réel (par défaut activé)
import animeSamaService from './src/services/animeSamaService';
animeSamaService.enableRealScraping();

// Logs de debug
import { configureAxiosForScraping } from './src/utils/scrapingUtils';
configureAxiosForScraping();
```

### Scripts Disponibles
```bash
npm run android    # Lancer sur Android
npm run ios        # Lancer sur iOS (macOS requis)
npm run web        # Lancer sur navigateur web
npm run start      # Démarrer Expo
```

## 🔧 Configuration

### Variables d'Environnement
```bash
# anime-sama.fr configuration
ANIME_SAMA_BASE_URL=https://anime-sama.fr

# Cache configuration (optionnel)
CACHE_EXPIRY_MINUTES=30
RETRY_ATTEMPTS=3

# MyAnimeList API (futur)
MAL_CLIENT_ID=your_client_id
MAL_CLIENT_SECRET=your_client_secret
```

### Configuration du Scraping
```typescript
// Dans animeSamaScrapingService.ts
private config = {
  baseUrl: 'https://anime-sama.fr',
  timeout: 10000,
  retryAttempts: 3,
  cacheExpiry: 30 * 60 * 1000, // 30 minutes
};
```

## 🎨 Interface Utilisateur

### Design System
- **Couleurs** : Palette moderne avec support du mode sombre
- **Typographie** : Hiérarchie claire et lisible
- **Espacement** : Grille cohérente de 8px
- **Animations** : Transitions fluides et naturelles
- **Composants** : Cards modulaires avec données réelles

### Expérience Utilisateur
- **Navigation intuitive** : Flow logique avec données actualisées
- **Feedback visuel** : États de chargement et cache
- **Performance** : Cache intelligent pour rapidité
- **Données réelles** : Contenu synchronisé avec anime-sama.fr

## 🔒 Sécurité et Légalité

### Scraping Responsable
- **Rate Limiting** : Délai entre requêtes pour respecter le serveur
- **User-Agent** : Identification claire de l'application
- **Cache** : Réduction du nombre de requêtes
- **Fallback** : Pas de dépendance exclusive au scraping

### Conformité
- Respect des conditions d'utilisation d'anime-sama.fr
- User-Agent approprié pour le scraping
- Limitation du taux de requêtes automatique
- Gestion respectueuse du contenu

### Données Personnelles
- Stockage local uniquement (SQLite)
- Aucune collecte de données personnelles
- Cache temporaire avec expiration
- Synchronisation optionnelle via MyAnimeList

## 🐛 Débogage

### Logs et Erreurs
```bash
# Logs en temps réel avec scraping
npx expo start --clear

# Debug du cache
console.log(animeSamaService.getCacheStats());

# Reset cache et données
animeSamaService.clearCache();
```

### Issues Courantes
- **Erreur CORS** : Utilise automatiquement les données de fallback
- **Échec scraping** : Cache et données mockées de secours
- **Images manquantes** : URLs générées automatiquement depuis le pattern CDN
- **Cache plein** : Nettoyage automatique des données expirées

### Monitoring du Scraping
```typescript
// Activer les logs détaillés
import { logScrapingAttempt } from './src/utils/scrapingUtils';

// Voir les tentatives en temps réel
// ✅ SUCCESS ou ❌ FAILED dans la console
```

## 🛣️ Roadmap de Développement

### Phase 1 : MVP (✅ Terminé)
- ✅ Architecture de base et navigation
- ✅ Base de données SQLite
- ✅ Interface utilisateur moderne
- ✅ Composants réutilisables

### Phase 2 : Interface Utilisateur (✅ Terminé)
- ✅ Écran d'accueil interactif
- ✅ Écran de détails d'animé
- ✅ Lecteur vidéo fonctionnel
- ✅ Navigation fluide

### Phase 3 : Scraping Réel (✅ Terminé)
- ✅ Service de scraping complet
- ✅ Extraction automatique des données
- ✅ Cache intelligent et gestion d'erreurs
- ✅ Interface unifiée données réelles/mockées

### Phase 4 : URLs de Streaming (🔄 En cours)
- 🔄 Analyse des lecteurs d'anime-sama.fr
- 🔄 Extraction des vraies URLs de streaming
- 🔄 Support des qualités multiples
- 🔄 Gestion des serveurs de streaming

### Phase 5 : Fonctionnalités Avancées (📋 Planifié)
- 📋 Écrans restants (Catalogue, Listes, Téléchargements)
- 📋 Recherche avancée dans le catalogue
- 📋 Synchronisation MyAnimeList
- 📋 Téléchargements hors-ligne
- 📋 Notifications push

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
- Consulter [`SCRAPING.md`](./SCRAPING.md) pour le scraping
- Vérifier les logs de développement

---

**Note** : Cette application est un client pour anime-sama.fr et n'héberge aucun contenu. Tout le contenu provient directement du site officiel via scraping responsable. L'application utilise un système de fallback avec données de test pour assurer la disponibilité en cas d'erreur.

**Nouveau** : Le scraping réel est maintenant implémenté et fonctionne avec les vraies données d'anime-sama.fr ! 🎉 