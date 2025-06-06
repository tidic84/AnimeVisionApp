import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MainTabScreenProps } from '../../types/navigation';

type SettingsScreenProps = MainTabScreenProps<'Settings'>;

const SettingsScreen: React.FC<SettingsScreenProps> = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Écran Paramètres</Text>
      <Text style={styles.subtext}>Configuration et synchronisation</Text>
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

export default SettingsScreen; 