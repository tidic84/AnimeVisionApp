import { ThemeProvider } from './src/contexts/ThemeContext';
import { useAppColorScheme as useColorScheme } from './src/contexts/ThemeContext';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { ApiProvider, useApi } from './src/contexts/ApiContext';
import databaseService from './src/services/databaseService';
import apiService from './src/services/apiService';
import { palette } from './src/theme/palette';

function AppContent() {
  const { setApiAvailable, setApiError, setOfflineMode } = useApi();
  const [ready, setReady] = useState(false);
  const colors = palette[useColorScheme() ?? 'light'];
  useEffect(() => {
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout>;
    const initialize = async () => {
      const connection = Promise.race([
        apiService.testConnection(),
        new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 8000); }),
      ]);
      try {
        // Screens may read lists/history immediately: initialize local storage first.
        const [database, online] = await Promise.allSettled([databaseService.initializeDatabase(), connection]);
        if (!mounted) return;
        const connected = online.status === 'fulfilled' && online.value;
        setApiAvailable(Boolean(connected));
        if (!connected) { setApiError('Connexion indisponible'); setOfflineMode(true); }
        if (database.status === 'rejected') console.error('[App] Stockage local indisponible:', database.reason);
      } finally {
        clearTimeout(timeout!);
        if (mounted) setReady(true);
      }
    };
    initialize();
    return () => { mounted = false; clearTimeout(timeout!); };
  }, []);
  if (!ready) return <View style={[styles.launch, { backgroundColor: colors.background }]}><Text style={[styles.wordmark, { color: colors.text }]}>anime<Text style={{ color: colors.primary }}>vision.</Text></Text><ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} /><Text style={{ marginTop: 16, color: colors.textSecondary }}>Votre prochaine histoire vous attend.</Text></View>;
  return <AppNavigator />;
}

export default function App() {
  return <SafeAreaProvider><ThemeProvider><ApiProvider><GestureHandlerRootView style={{ flex: 1 }}><AppContent /></GestureHandlerRootView></ApiProvider></ThemeProvider></SafeAreaProvider>;
}
const styles = StyleSheet.create({ launch: { flex: 1, alignItems: 'center', justifyContent: 'center' }, wordmark: { fontSize: 36, fontWeight: '800', letterSpacing: -1.5 } });
