# 🔧 Configuration AnimeVisionApp

## Configuration de l'API

L'application utilise la variable d'environnement `API_ADDRESS` pour se connecter à l'API AnimeVisionAPI.

### Configuration

#### Via fichier .env (méthode unique)

1. **Copiez le fichier d'exemple :**
```bash
cp env.example .env
```

2. **Modifiez l'adresse API dans `.env` :**
```bash
# .env
API_ADDRESS=http://192.168.1.XXX:8001
```

3. **Relancez l'application :**
```bash
npx expo start --clear
```

#### Ou via variable d'environnement système
```bash
export API_ADDRESS=http://votre-serveur:8001
npx expo start
```

**Important :** L'application utilise uniquement `process.env.API_ADDRESS`.

#### 3. Exemples d'adresses API

**Développement local :**
```
API_ADDRESS=http://localhost:8001
```

**Réseau local :**
```
API_ADDRESS=http://192.168.1.100:8001
```

**Production :**
```
API_ADDRESS=https://api.tidic.fr
```

### Vérification de la Configuration

L'application affichera dans les logs l'adresse API utilisée au démarrage :
```
[ApiService] Utilisation de l'API: http://votre-serveur:8001
```

Si la variable n'est pas définie, un avertissement sera affiché :
```
[ApiService] Variable API_ADDRESS non définie, utilisation du fallback localhost:8001
```

### Fallback par Défaut

Si la variable `API_ADDRESS` n'est pas définie, l'application utilisera :
- `http://localhost:8001`

### Services Concernés

Les services suivants utilisent uniquement `process.env.API_ADDRESS` :
- **ApiService** : API principale AnimeVisionAPI
- **VideoUrlExtractor** : Extraction d'URLs vidéo (`${API_ADDRESS}/extract-video`)

### API AnimeVisionAPI

Référez-vous au [readme-api.md](readme-api.md) pour plus d'informations sur l'API AnimeVisionAPI, ses endpoints et ses fonctionnalités. 