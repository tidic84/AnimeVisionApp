import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MainTabScreenProps } from '../../types/navigation';
import { useApi } from '../../contexts/ApiContext';

type DownloadsScreenProps = MainTabScreenProps<'Downloads'>;

const DownloadsScreen: React.FC<DownloadsScreenProps> = () => {
  const { isApiAvailable, isOfflineMode, apiError } = useApi();

  const handleRetryConnection = () => {
    Alert.alert(
      'Test de connexion',
      'La fonction de test de connexion sera implémentée dans les paramètres.',
      [{ text: 'OK' }]
    );
  };

  if (isOfflineMode) {
    return (
      <View style={styles.container}>
        <View style={styles.offlineContainer}>
          <Ionicons name="cloud-offline" size={80} color="#FF6B35" />
          <Text style={styles.offlineTitle}>Mode Hors Ligne</Text>
          <Text style={styles.offlineMessage}>
            L'API n'est pas disponible actuellement.
          </Text>
          {apiError && (
            <Text style={styles.errorText}>
              Erreur: {apiError}
            </Text>
          )}
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Fonctionnalités disponibles :</Text>
            <View style={styles.featureItem}>
              <Ionicons name="download" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Contenu téléchargé</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="settings" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Paramètres locaux</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="server" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Gestion du stockage</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.retryButton} onPress={handleRetryConnection}>
            <Ionicons name="refresh" size={20} color="white" />
            <Text style={styles.retryButtonText}>Réessayer la connexion</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.normalContainer}>
        <Ionicons name="download" size={80} color="#6366f1" />
        <Text style={styles.text}>Téléchargements</Text>
        <Text style={styles.subtext}>Gestion du contenu hors-ligne</Text>
        
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Bientôt disponible :</Text>
          <Text style={styles.featureText}>• Téléchargement d'épisodes</Text>
          <Text style={styles.featureText}>• Lecture hors ligne</Text>
          <Text style={styles.featureText}>• Gestion de l'espace de stockage</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  normalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  offlineTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginTop: 20,
    marginBottom: 10,
  },
  offlineMessage: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#ff4444',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6366f1',
    marginTop: 20,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 30,
  },
  infoContainer: {
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 10,
    marginVertical: 20,
    width: '100%',
    maxWidth: 350,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 15,
    textAlign: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureText: {
    fontSize: 16,
    color: '#555555',
    marginLeft: 10,
    flex: 1,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default DownloadsScreen; 