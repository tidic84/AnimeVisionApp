import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApi } from '../contexts/ApiContext';
import { useAppColorScheme } from '../contexts/ThemeContext';
import { palette } from '../theme/palette';
import { radii } from '../theme/shape';
import { spacing, typography } from '../theme/tokens';

interface ApiGuardProps {
  children: React.ReactNode;
  fallbackMessage?: string;
}

/** Remplace un écran qui dépend du catalogue quand l'API est injoignable ; les téléchargements restent accessibles. */
const ApiGuard: React.FC<ApiGuardProps> = ({
  children,
  fallbackMessage = 'Le catalogue est injoignable pour le moment. Vos épisodes téléchargés restent disponibles.',
}) => {
  const { isApiAvailable, apiError, checkApi } = useApi();
  const navigation = useNavigation();
  const colors = palette[useAppColorScheme()];
  const [checking, setChecking] = useState(false);

  if (isApiAvailable) return <>{children}</>;

  const retry = async () => {
    if (checking) return;
    setChecking(true);
    try { await checkApi(); } finally { setChecking(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Ionicons name="cloud-offline-outline" size={64} color={colors.textSecondary} />
      <Text style={[styles.title, { color: colors.text }]}>Hors ligne</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{fallbackMessage}</Text>
      {apiError && <Text style={[styles.detail, { color: colors.textTertiary }]}>{apiError}</Text>}
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.button, { backgroundColor: colors.buttonBg }]}
        onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Lists', params: { tab: 'Téléchargements' } })}
      >
        <Ionicons name="download-outline" size={18} color={colors.buttonText} />
        <Text style={[styles.buttonText, { color: colors.buttonText }]}>Accéder aux téléchargements</Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        disabled={checking}
        style={[styles.button, styles.secondary, { borderColor: colors.border }]}
        onPress={() => void retry()}
      >
        {checking ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="refresh" size={18} color={colors.text} />}
        <Text style={[styles.buttonText, { color: colors.text }]}>{checking ? 'Vérification…' : 'Réessayer'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  title: { ...typography.headline, marginTop: spacing.md, textAlign: 'center' },
  message: { ...typography.body, marginTop: spacing.xs, textAlign: 'center', maxWidth: 420 },
  detail: { ...typography.caption, marginTop: spacing.xs, textAlign: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minWidth: 240, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill, marginTop: spacing.sm },
  secondary: { backgroundColor: 'transparent', borderWidth: 1 },
  buttonText: { ...typography.bodyStrong },
});

export default ApiGuard;
