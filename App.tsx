import { ThemeProvider } from './src/contexts/ThemeContext';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { ApiProvider, useApi } from './src/contexts/ApiContext';
import databaseService from './src/services/databaseService';
import apiService from './src/services/apiService';

function AppContent() {
  const { setApiAvailable, setApiError } = useApi();
  useEffect(() => {
    let mounted = true;
    // Local readers await the same initialization promise; navigation never waits.
    void databaseService.initializeDatabase().catch(error => console.error('[App] Stockage local indisponible:', error));
    void apiService.testConnection().then(connected => {
      if (!mounted) return;
      setApiAvailable(connected);
      setApiError(connected ? null : 'Connexion indisponible');
    });
    return () => { mounted = false; };
  }, []);
  return <AppNavigator />;
}
export default function App() {
  return <SafeAreaProvider><ThemeProvider><ApiProvider><GestureHandlerRootView style={{ flex: 1 }}><AppContent /></GestureHandlerRootView></ApiProvider></ThemeProvider></SafeAreaProvider>;
}
