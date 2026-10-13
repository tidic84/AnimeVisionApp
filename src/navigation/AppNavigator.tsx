import { useAppColorScheme as useColorScheme } from '../contexts/ThemeContext';
import useReducedMotion from '../hooks/useReducedMotion';
import { palette } from '../theme/palette';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { View, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
const Colors = palette;

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
  const reducedMotion = useReducedMotion();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isApiAvailable, isOfflineMode } = useApi();
  const insets = useSafeAreaInsets();

  // Déterminer la route initiale en fonction de la disponibilité de l'API
  const getInitialRouteName = (): keyof MainTabParamList => {
    // La route initiale doit exister aussi lorsque le catalogue est indisponible.
    return isApiAvailable ? "Home" : "Downloads";
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
            iconName = focused ? 'bookmark' : 'bookmark-outline';
          } else if (route.name === 'Catalog') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'Downloads') {
            iconName = focused ? 'download' : 'download-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'person-circle' : 'person-circle-outline';
          } else {
            iconName = 'ellipse-outline';
          }

          // Garantir des valeurs par défaut pour éviter les icônes manquantes
          const iconSize = 27;
          const iconColor = color || colors.tabBarInactive;

          // Griser les onglets désactivés en mode offline
          const finalColor = (!isApiAvailable && route.name !== 'Downloads' && route.name !== 'Settings')
            ? colors.tabBarInactive + '50' // Semi-transparent
            : iconColor;

          return <Ionicons name={iconName} size={iconSize} color={finalColor} />;
        },
        animation: reducedMotion ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: reducedMotion ? 0 : 200, easing: Easing.out(Easing.cubic) } },
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          height: 74 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
          position: 'relative',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          shadowOpacity: 0,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
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
            title: 'Mes listes',
            headerShown: false,
          }}
        />
      )}
      {isApiAvailable && (
        <Tab.Screen
          name="Catalog"
          component={CatalogScreen}
          options={{
            title: 'Naviguer',
            headerShown: false,
            tabBarStyle: {
              position: 'relative',
              backgroundColor: colors.tabBar,
              height: 74 + insets.bottom,
              paddingBottom: 8 + insets.bottom,
              paddingTop: 6,
              borderTopWidth: 1,
          borderTopColor: colors.border,
              shadowOpacity: 0,
              elevation: 0,
            },
          }}
        />
      )}
      <Tab.Screen
        name="Downloads"
        component={DownloadsScreen}
        options={{
          title: 'Téléchargements',
          tabBarLabel: 'Hors ligne',
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Mon compte',
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const reducedMotion = useReducedMotion();
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
          animation: reducedMotion ? 'none' : 'slide_from_right',
          animationDuration: 280,
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
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
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="VideoPlayer"
          component={VideoPlayerScreen}
          options={{
            headerShown: false,
            animation: reducedMotion ? 'none' : 'fade',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
