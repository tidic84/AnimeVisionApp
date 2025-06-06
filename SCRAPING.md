# 🔍 Documentation Scraping Anime-Sama.fr

## Vue d'ensemble

Le système de scraping d'AnimeVision App permet d'extraire automatiquement les données du site anime-sama.fr pour alimenter l'application avec du contenu réel.

## Architecture du Scraping

### 🏗️ Structure des Services

```
src/services/
├── animeSamaService.ts          # Service principal (interface unifiée)
├── animeSamaScrapingService.ts  # Service de scraping réel
└── databaseService.ts           # Service de base de données locale
```

### 🔄 Flow de Données

1. **Interface Utilisateur** → `animeSamaService.ts`
2. **Service Principal** → `animeSamaScrapingService.ts` (si scraping activé)
3. **Service de Scraping** → `anime-sama.fr` (requêtes HTTP)
4. **Parsing HTML** → Extraction des données
5. **Cache & Fallback** → Données utilisables
6. **Base de Données** → Stockage local

## Structure d'Anime-Sama.fr

### 📍 URLs Importantes

- **Accueil** : `https://anime-sama.fr/`
- **Catalogue** : `https://anime-sama.fr/catalogue/`
- **Détails Animé** : `https://anime-sama.fr/catalogue/{anime-slug}/`
- **Épisodes** : `https://anime-sama.fr/catalogue/{anime-slug}/{saison}/{langue}/`

### 🎯 Sections Scrapées

#### Page d'Accueil
- **Derniers épisodes ajoutés** : Section `## Derniers épisodes ajoutés`
- **Les classiques** : Section `## les classiques`
- **Découvrez des pépites** : Section `## découvrez des pépites`

#### Page de Détails d'Animé
- **Titre** : Balise `<h1>`
- **Synopsis** : Section `## Synopsis`
- **Genres** : Section `## Genres`
- **Images** : CDN `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/`

#### Structure des Images
```
https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/{anime-slug}.jpg
```

## Implémentation Technique

### 🔧 Service de Scraping Principal

```typescript
// animeSamaScrapingService.ts
class AnimeSamaScrapingService {
  private config = {
    baseUrl: 'https://anime-sama.fr',
    timeout: 10000,
    retryAttempts: 3,
    cacheExpiry: 30 * 60 * 1000, // 30 minutes
  };

  // Cache intelligent avec expiration
  private cache = new Map<string, CacheItem<any>>();
  
  // Instance Axios configurée
  private axiosInstance = axios.create({
    timeout: this.config.timeout,
    headers: {
      'User-Agent': 'AnimeVisionApp/1.0 (Mobile App)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
  });
}
```

### 🎯 Méthodes de Parsing

#### Extraction des Derniers Épisodes
```typescript
private parseLatestEpisodesFromHTML(html: string): Episode[] {
  const episodeSection = html.match(/##\s*Derniers épisodes ajoutés([\s\S]*?)##/i);
  const episodeMatches = episodeSection[1].matchAll(
    /https:\/\/cdn\.statically\.io\/gh\/Anime-Sama\/IMG\/img\/contenu\/([^.]+)\.jpg\s+([^VOSTFR|VF]+)\s+(VOSTFR|VF)\s+(?:Saison\s+(\d+)\s+)?Episode\s+(\d+)/gi
  );
  // ...
}
```

#### Extraction des Détails d'Animé
```typescript
private parseAnimeFromHTML(html: string, animeSlug: string): Anime {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const synopsisMatch = html.match(/## Synopsis\s*([^#]+)/i);
  const genresMatch = html.match(/## Genres\s*([^#\n]+)/i);
  // ...
}
```

### 💾 Système de Cache

#### Configuration du Cache
- **Durée par défaut** : 30 minutes
- **Derniers épisodes** : 10 minutes (données fréquemment mises à jour)
- **Détails d'animé** : 30 minutes
- **URLs de streaming** : 60 minutes

#### Gestion Intelligente
```typescript
private setCacheItem<T>(key: string, data: T, customExpiry?: number): void {
  const expiry = customExpiry || this.config.cacheExpiry;
  this.cache.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + expiry,
  });
}
```

### 🔄 Système de Retry

#### Retry avec Délai Exponentiel
```typescript
private async retryRequest<T>(requestFn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < this.config.retryAttempts; i++) {
    try {
      return await requestFn();
    } catch (error) {
      if (i === this.config.retryAttempts - 1) throw error;
      
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Patterns d'Extraction

### 🏷️ Regex Patterns Utilisés

#### Épisodes
```regex
/https:\/\/cdn\.statically\.io\/gh\/Anime-Sama\/IMG\/img\/contenu\/([^.]+)\.jpg\s+([^VOSTFR|VF]+)\s+(VOSTFR|VF)\s+(?:Saison\s+(\d+)\s+)?Episode\s+(\d+)/gi
```

#### Numéros d'Épisodes
```regex
/Episode\s+(\d+)/gi
```

#### Images CDN
```regex
/https:\/\/cdn\.statically\.io\/gh\/Anime-Sama\/IMG\/img\/contenu\/([^"'>\s]+)/
```

#### Sections de Contenu
```regex
/##\s*{section_name}([\s\S]*?)##/i
```

### 📊 Données Extraites

#### Structure Episode
```typescript
interface Episode {
  id: string;           // "{animeId}-episode-{number}"
  animeId: string;      // Slug de l'animé
  number: number;       // Numéro de l'épisode
  title: string;        // Titre affiché
  thumbnail: string;    // URL de l'image
  duration: number;     // Durée en secondes
  // ...
}
```

#### Structure Anime
```typescript
interface Anime {
  id: string;           // Slug de l'animé
  title: string;        // Titre extrait
  synopsis: string;     // Synopsis parsé
  genres: string[];     // Liste des genres
  thumbnail: string;    // Image principale
  banner: string;       // Image de bannière
  // ...
}
```

## Gestion des Erreurs

### 🛡️ Stratégies de Fallback

#### 1. Données de Cache
- Utilise les données en cache même expirées en cas d'erreur réseau
- Préfère les données légèrement obsolètes au lieu d'aucune donnée

#### 2. Données Mockées
```typescript
private getFallbackLatestEpisodes(): Episode[] {
  return [
    {

    }
  ];
}
```

#### 3. Génération Automatique
- Création d'épisodes par défaut basée sur l'ID de l'animé
- Utilisation des patterns observés pour générer des données cohérentes

### 🚨 Types d'Erreurs Gérées

1. **Erreurs Réseau** : Timeout, connexion refusée
2. **Erreurs CORS** : Restrictions cross-origin en développement
3. **Erreurs de Parsing** : HTML inattendu, structure modifiée
4. **Erreurs de Cache** : Corruption des données, quota dépassé

## Limitations Actuelles

### 🚧 Contraintes Techniques

#### Environnement de Développement
- **CORS Policy** : Les navigateurs bloquent les requêtes cross-origin
- **Émulateur** : Proxy nécessaire pour contourner les restrictions
- **Débug Limité** : Difficile de tester le scraping en temps réel

#### Parsing HTML
- **Fragile** : Dépendant de la structure actuelle du site
- **Regex Basique** : Pas de parser HTML robuste (cheerio recommandé)
- **Données Incomplètes** : Certaines informations non extraites

#### Gestion des URLs de Streaming
- **Non Implémenté** : Extraction des vraies URLs de streaming
- **URLs de Test** : Utilise des vidéos de démonstration
- **Protection** : anime-sama.fr peut protéger ses liens de streaming

## Améliorations Futures

### 🔮 Roadmap Technique

#### Phase 1 : Robustesse
- [ ] Intégrer une vraie bibliothèque de parsing HTML
- [ ] Améliorer la gestion des erreurs
- [ ] Ajouter plus de patterns d'extraction
- [ ] Implémenter un système de monitoring

#### Phase 2 : Fonctionnalités
- [ ] Extraction des vraies URLs de streaming
- [ ] Support des sous-titres
- [ ] Métadonnées étendues (studios, années, notes)
- [ ] API de recherche avancée

#### Phase 3 : Performance
- [ ] Cache persistant avec SQLite
- [ ] Requêtes parallèles optimisées
- [ ] Compression des données
- [ ] Synchronisation en arrière-plan

### 🛠️ Outils Recommandés

#### Pour le Parsing
```bash
npm install cheerio          # Parser HTML robuste
npm install html-parser-js   # Alternative légère
npm install fast-xml-parser  # Pour les flux RSS/XML
```

#### Pour les Requêtes
```bash
npm install axios-retry      # Retry automatique
npm install p-limit          # Limitation de concurrence
npm install tough-cookie     # Gestion des cookies
```

#### Pour le Cache
```bash
npm install async-storage    # Cache persistant
npm install lru-cache        # Cache LRU intelligent
npm install redis-client     # Cache distribué (production)
```

## Configuration et Test

### ⚙️ Activation du Scraping

```typescript
// Dans n'importe quel composant
import animeSamaService from '../services/animeSamaService';

// Activer le scraping réel
animeSamaService.enableRealScraping();

// Désactiver (retour aux données mockées)
animeSamaService.disableRealScraping();

// Statistiques du cache
console.log(animeSamaService.getCacheStats());
```

### 🧪 Tests et Debug

#### Console Logs
```typescript
// Activer les logs détaillés
import { logScrapingAttempt } from '../utils/scrapingUtils';

// Dans le service
logScrapingAttempt(url, true);   // Succès
logScrapingAttempt(url, false, error); // Échec
```

#### Monitoring des Requêtes
```typescript
// Intercepteur Axios pour debug
axios.interceptors.request.use(request => {
  console.log('🚀 Requête:', request.url);
  return request;
});

axios.interceptors.response.use(
  response => {
    console.log('✅ Réponse:', response.status);
    return response;
  },
  error => {
    console.log('❌ Erreur:', error.message);
    return Promise.reject(error);
  }
);
```

## Considérations Légales

### ⚖️ Respect des Conditions

1. **Rate Limiting** : Limitation du nombre de requêtes par minute
2. **User-Agent** : Identification claire de l'application
3. **Robots.txt** : Respect des directives du site
4. **DMCA** : Pas d'hébergement de contenu, seulement référencement

### 🤝 Bonnes Pratiques

- **Throttling** : Délai entre les requêtes
- **Respect** : Pas de surcharge du serveur
- **Transparence** : User-Agent identifiable
- **Fallback** : Toujours prévoir une alternative

---

**Note Importante** : Ce système de scraping est conçu pour fonctionner en production sur mobile. En développement, les restrictions CORS peuvent nécessiter l'utilisation des données de fallback. 