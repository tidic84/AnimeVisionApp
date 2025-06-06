import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  type?: 'network' | 'parsing' | 'general';
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ 
  message, 
  onRetry, 
  type = 'general' 
}) => {
  const colorScheme = useColorScheme();
  
  const colors = {
    light: {
      background: '#fef2f2',
      border: '#fecaca',
      text: '#b91c1c',
      textSecondary: '#7f1d1d',
      buttonBg: '#dc2626',
      buttonText: '#ffffff',
    },
    dark: {
      background: '#1f1617',
      border: '#7f1d1d',
      text: '#f87171',
      textSecondary: '#dc2626',
      buttonBg: '#dc2626',
      buttonText: '#ffffff',
    },
  }[colorScheme ?? 'light'];

  const getIcon = () => {
    switch (type) {
      case 'network':
        return 'wifi-outline';
      case 'parsing':
        return 'alert-circle-outline';
      default:
        return 'warning-outline';
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'network':
        return 'Erreur de connexion';
      case 'parsing':
        return 'Erreur de données';
      default:
        return 'Erreur';
    }
  };

  const getDescription = () => {
    if (message.includes('Network Error') || message.includes('CORS')) {
      return 'Impossible de se connecter à anime-sama.fr. Vérifiez votre connexion internet.';
    }
    if (message.includes('anime-sama.fr')) {
      return 'Le site anime-sama.fr semble avoir changé de structure. L\'application sera mise à jour prochainement.';
    }
    return message;
  };

  return (
    <View style={[styles.container, { 
      backgroundColor: colors.background, 
      borderColor: colors.border 
    }]}>
      <View style={styles.header}>
        <Ionicons 
          name={getIcon()} 
          size={32} 
          color={colors.text} 
          style={styles.icon}
        />
        <Text style={[styles.title, { color: colors.text }]}>
          {getTitle()}
        </Text>
      </View>
      
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {getDescription()}
      </Text>

      {onRetry && (
        <TouchableOpacity 
          style={[styles.retryButton, { backgroundColor: colors.buttonBg }]}
          onPress={onRetry}
        >
          <Ionicons name="refresh" size={16} color={colors.buttonText} />
          <Text style={[styles.retryText, { color: colors.buttonText }]}>
            Réessayer
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
});

export default ErrorMessage; 