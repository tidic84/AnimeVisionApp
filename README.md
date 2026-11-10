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
