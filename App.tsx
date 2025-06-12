import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { ApiProvider, useApi } from './src/contexts/ApiContext';
import databaseService from './src/services/databaseService';
import apiService from './src/services/apiService';

// Composant principal de l'app qui utilise le contexte API
function AppContent() {
  const { setApiAvailable, setApiError, setOfflineMode } = useApi();

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('[App] 🚀 Initialisation de l\'application...');
      
      // Démarrer l'app immédiatement avec squelette
      setTimeout(async () => {
        // Timeout de sécurité pour éviter le chargement infini
        const initTimeout = setTimeout(() => {
          console.warn('[App] ⚠️ Timeout d\'initialisation - mode hors ligne forcé');
          setApiError('Timeout de connexion');
          setOfflineMode(true);
        }, 15000); // 15 secondes maximum
        
        // 1. Test CRITIQUE de l'API en premier
        const isApiWorking = await testApiConnection();
        
        if (!isApiWorking) {
          console.warn('[App] ❌ API non disponible - Mode hors ligne activé');
          setApiError('API non disponible');
          setOfflineMode(true);
          
          // Montrer un message informatif
          Alert.alert(
            'Mode Hors Ligne',
            'L\'API n\'est pas disponible. Vous êtes redirigé vers les téléchargements où vous pouvez accéder au contenu hors ligne.',
            [{ text: 'Continuer', style: 'default' }]
          );
        } else {
          console.log('[App] ✅ API disponible - Mode normal');
          setApiAvailable(true);
        }
        
        // 2. Initialiser la base de données
        await databaseService.initializeDatabase();
        console.log('[App] ✅ Base de données initialisée');
        
        clearTimeout(initTimeout);
        console.log('[App] ✅ Application prête');
      }, 100); // Délai minimal pour afficher l'interface
      
    } catch (error) {
      console.error('[App] ❌ Erreur lors de l\'initialisation:', error);
      
      // En cas d'erreur critique, forcer le mode hors ligne
      setApiError(`Erreur d'initialisation: ${error}`);
      setOfflineMode(true);
      
      Alert.alert(
        'Erreur d\'initialisation',
        'Une erreur est survenue. L\'application démarrera en mode hors ligne.',
        [{ text: 'Continuer', style: 'default' }]
      );
    }
  };

  const testApiConnection = async (): Promise<boolean> => {
    try {
      console.log('[App] 🌐 Test de connexion API...');
      
      // Test avec timeout court
      const testPromise = apiService.testConnection();
      const timeoutPromise = new Promise<boolean>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout API')), 8000)
      );
      
      const isConnected = await Promise.race([testPromise, timeoutPromise]);
      
      if (isConnected) {
        console.log('[App] ✅ API fonctionnelle');
        return true;
      } else {
        console.warn('[App] ⚠️ API non fonctionnelle');
        return false;
      }
    } catch (error) {
      console.warn('[App] ⚠️ Erreur test API:', error);
      return false;
    }
  };

  // Toujours afficher l'interface (avec squelette si nécessaire)
  return <AppNavigator />;
}

// Composant racine avec le provider
export default function App() {
  return (
    <ApiProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppContent />
      </GestureHandlerRootView>
    </ApiProvider>
  );
}

const styles = StyleSheet.create({
  // Styles supprimés car plus d'écran de chargement
});
