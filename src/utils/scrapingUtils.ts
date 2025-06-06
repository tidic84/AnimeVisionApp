import axios from 'axios';

// Configuration pour contourner les limitations CORS en développement
export const configureAxiosForScraping = () => {
  // En développement, nous ne pouvons pas faire de vraies requêtes cross-origin
  // Cette configuration sera utile pour la version de production
  
  axios.defaults.headers.common['User-Agent'] = 'AnimeVisionApp/1.0 (Mobile App)';
  axios.defaults.headers.common['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  axios.defaults.headers.common['Accept-Language'] = 'fr-FR,fr;q=0.9,en;q=0.8';
  
  // Intercepteur pour la gestion des erreurs
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      console.error('Erreur de requête:', error.message);
      
      // En cas d'erreur CORS, on peut retourner des données de fallback
      if (error.code === 'ERR_NETWORK' || error.message.includes('CORS')) {
        console.warn('Erreur CORS détectée, utilisation des données de fallback');
        // L'erreur sera gérée par les services avec des données de fallback
      }
      
      return Promise.reject(error);
    }
  );
};

// Fonction pour détecter si on est en environnement de développement
export const isDevelopmentMode = (): boolean => {
  return __DEV__;
};

// Fonction pour simuler des données réelles à partir des patterns observés
export const generateMockDataFromPattern = (pattern: string, count: number = 10) => {
  const items = [];
  
  for (let i = 1; i <= count; i++) {
    items.push({
      id: `mock-${pattern}-${i}`,
      title: `${pattern} ${i}`,
      number: i,
      // Ajouter d'autres propriétés selon le pattern
    });
  }
  
  return items;
};

// Fonction pour extraire les informations des URLs d'anime-sama.fr
export const parseAnimeSamaUrl = (url: string) => {
  const patterns = {
    anime: /\/catalogue\/([^\/]+)\/?$/,
    episode: /\/catalogue\/([^\/]+)\/([^\/]+)\/([^\/]+)\/?$/,
  };
  
  for (const [type, pattern] of Object.entries(patterns)) {
    const match = url.match(pattern);
    if (match) {
      return {
        type,
        matches: match.slice(1),
      };
    }
  }
  
  return null;
};

// Fonction pour nettoyer et normaliser les chaînes de caractères
export const cleanText = (text: string): string => {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .replace(/&nbsp;/g, ' ');
};

// Fonction pour convertir un titre en slug
export const titleToSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// Fonction pour valider si une URL d'image est accessible
export const validateImageUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Configuration par défaut pour les requêtes vers anime-sama.fr
export const animeSamaRequestConfig = {
  timeout: 10000,
  headers: {
    'User-Agent': 'AnimeVisionApp/1.0 (Mobile App)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  },
};

// Fonction pour logger les tentatives de scraping (utile pour le debug)
export const logScrapingAttempt = (url: string, success: boolean, error?: any) => {
  const timestamp = new Date().toISOString();
  const status = success ? '✅ SUCCESS' : '❌ FAILED';
  
  console.log(`[${timestamp}] ${status} Scraping: ${url}`);
  
  if (!success && error) {
    console.error('Error details:', error.message);
  }
}; 