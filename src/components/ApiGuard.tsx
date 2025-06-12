import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApi } from '../contexts/ApiContext';

interface ApiGuardProps {
  children: React.ReactNode;
  fallbackMessage?: string;
}

const ApiGuard: React.FC<ApiGuardProps> = ({ 
  children, 
  fallbackMessage = "Cette fonctionnalité nécessite une connexion à l'API." 
}) => {
  const { isApiAvailable, apiError } = useApi();
  const navigation = useNavigation();

  if (!isApiAvailable) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline" size={80} color="#FF6B35" />
          <Text style={styles.title}>API Non Disponible</Text>
          <Text style={styles.message}>{fallbackMessage}</Text>
          
          {apiError && (
            <Text style={styles.errorText}>Erreur: {apiError}</Text>
          )}
          
          <TouchableOpacity 
            style={styles.button} 
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Downloads' })}
          >
            <Ionicons name="download" size={20} color="white" />
            <Text style={styles.buttonText}>Accéder aux téléchargements</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]} 
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color="#FF6B35" />
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#ff4444',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginVertical: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButtonText: {
    color: '#FF6B35',
  },
});

export default ApiGuard; 