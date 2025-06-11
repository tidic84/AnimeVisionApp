import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import databaseService from './src/services/databaseService';
import animeSamaService from './src/services/animeSamaService';

export default function App() {
  const [isDbInitialized, setIsDbInitialized] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('[App] Initialisation de l\'application...');
      
      // Initialiser la base de données
      await databaseService.initializeDatabase();
      console.log('[App] Base de données initialisée');
      
      // Tester la connectivité API et configurer le fallback
      await animeSamaService.checkAndFallbackToScraping();
      
      // Initialiser le cache en arrière-plan (non bloquant)
      initializeCacheInBackground();
      
      setIsDbInitialized(true);
      console.log('[App] Application prête');
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de l\'application:', error);
      // En cas d'erreur, on permet quand même le démarrage de l'app
      setIsDbInitialized(true);
    }
  };

  const initializeCacheInBackground = async () => {
    try {
      // Précharger le cache si nécessaire (non bloquant)
      const hasCache = await animeSamaService.hasCompleteHomeCache();
      
      if (!hasCache) {
        console.log('[App] Pas de cache détecté - préchargement en arrière-plan...');
        // Précharger silencieusement les données essentielles
        setTimeout(async () => {
          try {
            await Promise.all([
              animeSamaService.getLatestEpisodes(),
              animeSamaService.getPopularAnimes()
            ]);
            console.log('[App] Préchargement du cache terminé');
          } catch (error) {
            console.warn('[App] Échec du préchargement du cache:', error);
          }
        }, 100);
      } else {
        console.log('[App] Cache existant détecté - prêt pour navigation rapide');
      }
    } catch (error) {
      console.warn('[App] Erreur lors de l\'initialisation du cache:', error);
    }
  };

  if (!isDbInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppNavigator />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});
