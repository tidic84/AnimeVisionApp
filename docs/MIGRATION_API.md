# 🔄 Guide de Migration vers la Nouvelle API

## Vue d'ensemble

L'application AnimeVision a été migrée vers une nouvelle API REST avec une structure de données différente. Ce guide documente les changements principaux et les adaptations effectuées.

## 🌐 Nouvelle URL de l'API

**Ancienne API :** `http://localhost:8001`  
**Nouvelle API :** `https://formally-liberal-drum.ngrok-free.app`

## 📊 Changements de Structure

### 1. Structure Hiérarchique

La nouvelle API utilise une structure hiérarchique :
- **Anime** → **Saisons** → **Épisodes**

```
Anime (id: 130)
├── Saison 1 (id: 130)
│   ├── Episode 1 (id: 2033)
│   ├── Episode 2 (id: 2034)
│   └── ...
└── (autres saisons si applicable)
```

### 2. Nouveaux Endpoints

| Ancien | Nouveau | Description |
|--------|---------|-------------|
| `/api/v1/mobile/latest-episodes` | `/api/episodes/latest` | Derniers épisodes |
| `/api/v1/mobile/popular-animes` | `/api/anime/popular` | Animés populaires |
| `/api/v1/anime/{id}` | `/api/anime/{id}` | Détails d'un animé |
| ❌ | `/api/anime/{id}/saisons` | **NOUVEAU:** Saisons d'un animé |
| ❌ | `/api/saison/{id}/episodes` | **NOUVEAU:** Épisodes d'une saison |
| ❌ | `/api/discover/trending` | **NOUVEAU:** Animés en tendance |

### 3. Format de Réponse

#### Ancienne API
```json
{
  "success": true,
  "data": [...],
  "pagination": {...}
}
```

#### Nouvelle API
```json
{
  "data": [...],
  "pagination": {...},
  "meta": {
    "cache_hit": true,
    "response_time": "45ms",
    "timestamp": "2024-01-15T08:30:00Z"
  }
}
```

## 🔧 Modifications Apportées

### 1. Types TypeScript

**Ajouts dans `src/types/anime.ts` :**
- Interface `Season` pour les saisons
- Interface `StreamingServer` pour les serveurs de streaming
- Interface `ApiResponse<T>` pour les réponses standardisées
- Interface `ApiError` pour la gestion d'erreurs

### 2. Service API

**Fichier modifié :** `src/services/apiService.ts`

#### Nouvelles méthodes :
- `getSeasonById(seasonId)` - Récupère les détails d'une saison
- `getAnimeSeasons(animeId)` - Récupère les saisons d'un animé
- `getSeasonEpisodes(seasonId, animeId?)` - Récupère les épisodes d'une saison
- `getTrendingAnimes()` - Récupère les animés en tendance

#### Modifications importantes :
- `mapApiEpisodeToEpisode()` : Support de l'`animeId` optionnel
- `getEpisodeById()` : Récupération de l'`animeId` via la saison
- `getAnimeEpisodes()` : Validation de l'`animeId` et gestion d'erreurs améliorée

### 3. Lecteur Vidéo

**Fichier modifié :** `src/screens/VideoPlayer/VideoPlayerScreen.tsx`

#### Corrections apportées :
- Récupération séquentielle des données (épisode → animeId → autres épisodes)
- Gestion des `animeId` vides ou invalides
- URL de fallback pour le lecteur vidéo (évite l'erreur "source.uri should not be an empty string")

### 4. Streaming Servers

La nouvelle API utilise un format différent pour les serveurs de streaming :

#### Nouveau format :
```json
{
  "streaming_servers": [
    {
      "name": "Serveur 1",
      "url": "https://example.com/video",
      "quality": "HD",
      "langue": "vostfr"
    }
  ]
}
```

#### Conversion :
Les `streaming_servers` sont automatiquement convertis en `streamingUrls` pour maintenir la compatibilité avec l'interface existante.

## 🚀 Nouvelles Fonctionnalités

### 1. Découverte d'Animés
- `/api/discover/trending` - Algorithme mixte (70% récents + 30% populaires)
- `/api/discover/by-genre/{genre}` - Animés par genre
- `/api/discover/random` - Sélection aléatoire

### 2. Recherche Améliorée
- `/api/search/suggestions` - Suggestions de recherche
- `/api/anime/search` - Recherche avec filtres

### 3. Métadonnées Enrichies
- Cache hit/miss dans les réponses
- Temps de réponse
- Timestamps
- Informations de pagination améliorées

## ⚠️ Points d'Attention

### 1. Gestion des Erreurs
L'API renvoie maintenant des erreurs structurées :
```json
{
  "error": true,
  "message": "Animé avec l'ID 99999 non trouvé",
  "status": 404,
  "timestamp": "2024-01-15T08:30:00Z"
}
```

### 2. Cache Intelligent
- TTL adaptatifs par type de données
- Headers de cache dans les réponses
- Performance optimisée (< 2s garanties)

### 3. Validation des Données
- Validation stricte des `animeId`
- Gestion des cas limites (IDs vides, anciens IDs)
- Fallbacks automatiques

## 🧪 Tests

### Script de Test
Un script de test a été créé pour valider le bon fonctionnement :
```bash
node test-integration.js
```

### Workflow Testé
1. ✅ Health Check
2. ✅ Latest Animes
3. ✅ Popular Animes  
4. ✅ Trending Animes
5. ✅ Search Animes
6. ✅ Anime Details
7. ✅ Anime Seasons
8. ✅ Season Episodes

## 📝 Compatibilité

### Rétrocompatibilité
- Les anciennes méthodes sont maintenues pour compatibilité
- Mapping automatique des anciennes structures vers les nouvelles
- Fallbacks en cas d'erreur

### Migration Transparente
L'utilisateur final ne devrait remarquer aucun changement dans l'interface, mais bénéficiera :
- ⚡ De meilleures performances
- 🔄 D'un cache plus intelligent
- 📱 D'une meilleure fiabilité
- 🆕 De nouvelles fonctionnalités de découverte

## 🎯 Prochaines Étapes

1. **Monitoring** : Surveiller les performances en production
2. **Optimisation** : Ajuster les TTL de cache selon l'usage
3. **Fonctionnalités** : Exploiter les nouvelles API de découverte
4. **Nettoyage** : Supprimer l'ancien code après validation complète

---

**Date de migration :** 20 Juin 2025  
**Version API :** v2.0  
**Statut :** ✅ Complète et testée 