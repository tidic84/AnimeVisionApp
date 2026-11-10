import { ThemeProvider, useAppColorScheme } from './src/contexts/ThemeContext';
import * as SystemUI from 'expo-system-ui';
import { palette } from './src/theme/palette';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { ApiProvider, useApi } from './src/contexts/ApiContext';
import databaseService from './src/services/databaseService';
import apiService from './src/services/apiService';
import * as malSync from './src/services/mal/malSync';
import * as updates from './src/services/updateService';
import { DialogProvider } from './src/components/Dialog';
import { logger } from './src/utils/logger';

function AppContent() {
  const { setApiAvailable, setApiError } = useApi();
  useEffect(() => {
    let mounted = true;
    // Local readers await the same initialization promise; navigation never waits.
    void databaseService.initializeDatabase().catch(error => logger.error('[App] Stockage local indisponible:', error));
    void apiService.testConnection().then(connected => {
      if (!mounted) return;
      setApiAvailable(connected);
      setApiError(connected ? null : 'Connexion indisponible');
      // Mises à jour MyAnimeList restées en attente (épisodes vus hors connexion).
      if (connected) void malSync.flushPending().catch(() => {});
    });
    void updates.checkOnLaunch();
    return () => { mounted = false; };
  }, []);
  return <AppNavigator />;
}
// Fond natif aligné sur le thème : sinon les transitions laissent voir la fenêtre blanche.
function ThemedRoot({ children }: React.PropsWithChildren) {
  const background = palette[useAppColorScheme()].background;
  useEffect(() => { void SystemUI.setBackgroundColorAsync(background).catch(() => {}); }, [background]);
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: background }}>{children}</GestureHandlerRootView>;
}
export default function App() {
  return <SafeAreaProvider><ThemeProvider><ApiProvider><ThemedRoot><DialogProvider><AppContent /></DialogProvider></ThemedRoot></ApiProvider></ThemeProvider></SafeAreaProvider>;
}
