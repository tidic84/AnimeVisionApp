import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  MainTabs: undefined;
  Home: undefined;
  AnimeDetail: { animeId: string };
  VideoPlayer: { 
    episodeId: string; 
    animeId: string; 
    autoPlay?: boolean;
    localFilePath?: string; // Chemin du fichier téléchargé localement
    isOfflineMode?: boolean; // Indique si c'est un fichier local (hors ligne)
    startFullscreen?: boolean; // Ouvre directement en plein écran paysage (épisode suivant)
  };
  Search: { query?: string };
  Stats: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Lists: { tab?: 'Téléchargements' } | undefined;
  Catalog: undefined;
  Planning: undefined;
  Settings: undefined;
};

export type RootStackScreenProps<Screen extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, Screen>;

export type MainTabScreenProps<Screen extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, Screen>,
    NativeStackScreenProps<RootStackParamList>
  >;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
} 