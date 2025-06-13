import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View } from 'react-native';

import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { useApi } from '../contexts/ApiContext';

// Importation des écrans
import HomeScreen from '../screens/Home/HomeScreen';
import ListsScreen from '../screens/Lists/ListsScreen';
import CatalogScreen from '../screens/Catalog/CatalogScreen';
import DownloadsScreen from '../screens/Downloads/DownloadsScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import AnimeDetailScreen from '../screens/AnimeDetail/AnimeDetailScreen';
import VideoPlayerScreen from '../screens/VideoPlayer/VideoPlayerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Configuration des couleurs pour les thèmes
const Colors = {
  light: {
    primary: '#6366f1',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#1e293b',
    tabBar: '#ffffff',
    tabBarInactive: '#64748b',
    border: '#e2e8f0',
  },
  dark: {
    primary: '#818cf8',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    tabBar: '#1e293b',
    tabBarInactive: '#64748b',
    border: '#334155',
  },
};

// Composant Fallback pour les icônes
const FallbackIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <View style={{
    width: size,
    height: size,
    backgroundColor: color,
    borderRadius: size / 2,
    opacity: 0.3,
  }} />
);

function MainTabNavigator() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isApiAvailable, isOfflineMode } = useApi();

  // Déterminer la route initiale en fonction de la disponibilité de l'API
  const getInitialRouteName = (): keyof MainTabParamList => {
    // Toujours démarrer sur Home - l'app gérera la redirection si l'API n'est pas disponible
    return "Home";
  };

  return (
    <Tab.Navigator
      initialRouteName={getInitialRouteName()}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Lists') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'Catalog') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'Downloads') {
            iconName = focused ? 'download' : 'download-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          } else {
            iconName = 'ellipse-outline';
          }

          // Garantir des valeurs par défaut pour éviter les icônes manquantes
          const iconSize = size || 24;
          const iconColor = color || colors.tabBarInactive;

          // Griser les onglets désactivés en mode offline
          const finalColor = (!isApiAvailable && route.name !== 'Downloads' && route.name !== 'Settings') 
            ? colors.tabBarInactive + '50' // Semi-transparent
            : iconColor;

          return <Ionicons name={iconName} size={iconSize} color={finalColor} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 90,
          paddingBottom: 32,
          paddingTop: 8,
          position: 'absolute',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
        headerTitleStyle: {
          color: colors.text,
          fontSize: 18,
          fontWeight: '600',
        },
        headerTintColor: colors.text,
        // Désactiver la navigation pour les onglets qui nécessitent l'API
        tabBarButton: (!isApiAvailable && route.name !== 'Downloads' && route.name !== 'Settings') 
          ? () => null // Masquer complètement les onglets désactivés
          : undefined,
      })}
    >
      {isApiAvailable && (
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
          options={{
            title: 'Accueil',
            headerShown: false,
          }}
        />
      )}
      {isApiAvailable && (
        <Tab.Screen 
          name="Lists" 
          component={ListsScreen}
          options={{
            title: 'Mes Listes',
          }}
        />
      )}
      {isApiAvailable && (
        <Tab.Screen 
          name="Catalog" 
          component={CatalogScreen}
          options={{
            title: 'Catalogue',
          }}
        />
      )}
      <Tab.Screen 
        name="Downloads" 
        component={DownloadsScreen}
        options={{
          title: 'Téléchargements',
          headerTitle: isOfflineMode ? 'Mode Hors Ligne' : 'Téléchargements',
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{
          title: 'Paramètres',
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <NavigationContainer
      theme={{
        dark: colorScheme === 'dark',
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
        fonts: {
          regular: {
            fontFamily: 'System',
            fontWeight: 'normal',
          },
          medium: {
            fontFamily: 'System',
            fontWeight: '500',
          },
          bold: {
            fontFamily: 'System',
            fontWeight: 'bold',
          },
          heavy: {
            fontFamily: 'System',
            fontWeight: '900',
          },
        },
      }}
    >
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
            fontSize: 18,
            fontWeight: '600',
          },
          headerTintColor: colors.text,
        }}
      >
        <Stack.Screen 
          name="MainTabs" 
          component={MainTabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AnimeDetail" 
          component={AnimeDetailScreen}
          options={{ 
            title: 'Détails',
            presentation: 'modal',
          }}
        />
        <Stack.Screen 
          name="VideoPlayer" 
          component={VideoPlayerScreen}
          options={{ 
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
} 