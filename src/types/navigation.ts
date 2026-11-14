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
  ComicDetail: { provider: string; comicId: string };
  /** `page`/`offset` : position à rouvrir (reprise) ; absents, le lecteur reprend la position enregistrée. */
  ComicReader: { provider: string; comicId: string; chapterId: string; language: string; page?: number; offset?: number };
};

export type MainTabParamList = {
  Home: undefined;
  Lists: { tab?: 'Téléchargements' } | undefined;
  Catalog: undefined;
  Scans: { section?: 'all' | 'manga' | 'manhwa' | 'manhua' | 'local' } | undefined;
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