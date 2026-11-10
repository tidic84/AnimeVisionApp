import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOptionalColorScheme } from '../contexts/ThemeContext';
import { palette } from '../theme/palette';
import { radii } from '../theme/shape';
import { spacing, typography } from '../theme/tokens';
import { formatRecentErrors, logger } from '../utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
  message?: string;
  /** Action secondaire de l'écran de repli (par exemple revenir à l'écran précédent). */
  actionLabel?: string;
  onAction?: () => void;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState { error: Error | null }

/**
 * Remplace un arbre qui a planté pendant le rendu par un écran de repli au lieu d'un écran blanc.
 * « Réessayer » remonte l'arbre depuis zéro.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('[ErrorBoundary]', error, info.componentStack?.trim().split('\n').slice(0, 6).join(' | '));
    try { this.props.onError?.(error); } catch { /* le repli doit s'afficher quoi qu'il arrive */ }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { title, message, actionLabel, onAction } = this.props;
    return <ErrorFallback error={error} title={title} message={message} actionLabel={actionLabel} onAction={onAction} onRetry={this.reset} />;
  }
}

interface FallbackProps {
  error: Error;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onRetry: () => void;
}

/** N'utilise que la palette statique : le thème n'est lu que s'il est disponible. */
function ErrorFallback({ error, title = 'Un problème est survenu', message = 'L’application a rencontré une erreur inattendue. Vous pouvez réessayer ; si le problème persiste, partagez le rapport pour aider à le corriger.', actionLabel, onAction, onRetry }: FallbackProps) {
  const colors = palette[useOptionalColorScheme() ?? 'dark'];
  const shareReport = () => {
    Share.share({ title: 'Rapport d’erreur AnimeVision', message: formatRecentErrors() }).catch(() => {});
  };
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="warning-outline" size={56} color={colors.warning} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
        <Text numberOfLines={3} style={[styles.detail, { color: colors.textTertiary }]}>{error.message}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.button, { backgroundColor: colors.buttonBg, opacity: pressed ? 0.8 : 1 }]}>
          <Ionicons name="refresh" size={18} color={colors.buttonText} />
          <Text style={[styles.buttonText, { color: colors.buttonText }]}>Réessayer</Text>
        </Pressable>
        {actionLabel && onAction && (
          <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.button, styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
            <Ionicons name="arrow-back" size={18} color={colors.text} />
            <Text style={[styles.buttonText, { color: colors.text }]}>{actionLabel}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={shareReport} hitSlop={8} style={styles.link}>
          <Text style={[typography.body, { color: colors.primary }]}>Partager le rapport d’erreur</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  title: { ...typography.headline, marginTop: spacing.md, textAlign: 'center' },
  message: { ...typography.body, marginTop: spacing.xs, textAlign: 'center', maxWidth: 420 },
  detail: { ...typography.caption, marginTop: spacing.sm, marginBottom: spacing.lg, textAlign: 'center', maxWidth: 420 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minWidth: 220, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill, marginTop: spacing.sm },
  secondary: { backgroundColor: 'transparent', borderWidth: 1 },
  buttonText: { ...typography.bodyStrong },
  link: { marginTop: spacing.lg, paddingVertical: spacing.xs },
});
