import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MainTabScreenProps } from '../../types/navigation';

type CatalogScreenProps = MainTabScreenProps<'Catalog'>;

const CatalogScreen: React.FC<CatalogScreenProps> = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Écran Catalogue</Text>
      <Text style={styles.subtext}>Navigation et recherche d'animés</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 16,
    color: '#666',
  },
});

export default CatalogScreen; 