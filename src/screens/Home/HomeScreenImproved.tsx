import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  useColorScheme,
  RefreshControl,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import { Episode, Anime } from '../../types/anime';
import apiService from '../../services/apiService';
import databaseService from '../../services/databaseService';
import { useApi } from '../../contexts/ApiContext';

const { width: screenWidth } = Dimensions.get('window');

const Colors = {
  light: {
    primaryStart: '#219B9B',
    primaryEnd: '#0F6B7B',
    primary: '#0F6B7B',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    card: '#ffffff',
  },
  dark: {
    primaryStart: '#219B9B',
    primaryEnd: '#0F6B7B',
    primary: '#0F6B7B',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    card: '#1e293b',
  },
};

const HomeScreenImproved: React.FC = () => {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isApiAvailable, isOfflineMode } = useApi();
  
  const [latestEpisodes, setLatestEpisodes] = useState<Episode[]>([]);
  const [continueWatching, setContinueWatching] = useState<Anime[]>([]);
  const [recommendedAnimes, setRecommendedAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (isApiAvailable) {
      loadHomeData();
    }
  }, [isApiAvailable]);

  useFocusEffect(
    useCallback(() => {
      if (isApiAvailable) {
        updateContinueWatching();
      }
    }, [isApiAvailable])
  );

  const loadHomeData = async () => {
    try {
      setLoading(true);
      
      // Charger en parallèle
      const [episodes, animes] = await Promise.all([
        apiService.getLatestEpisodes().catch(() => []),
        apiService.getPopularAnimes().catch(() => [])
      ]);
      
      setLatestEpisodes(episodes.slice(0, 10));
      setRecommendedAnimes(animes.slice(0, 10));
      
      // Mettre à jour "Continuer à regarder"
      await updateContinueWatching();
      
    } catch (error) {
      console.error('[HomeScreen] Erreur lors du chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateContinueWatching = async () => {
    try {
      const recentAnimes = await databaseService.getRecentlyWatchedAnimes(5);
      setContinueWatching(recentAnimes);
    } catch (error) {
      console.error('[HomeScreen] Erreur continuer à regarder:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    if (!isApiAvailable) return;
    
    setRefreshing(true);
    await loadHomeData();
    setRefreshing(false);
  }, [isApiAvailable]);

  const navigateToAnimeDetail = (animeId: string) => {
    navigation.navigate('AnimeDetail' as never, { animeId } as never);
  };

  const playEpisode = (episode: Episode) => {
    navigation.navigate('VideoPlayer' as never, { 
      episodeId: episode.id,
      animeId: episode.animeId 
    } as never);
  };

  if (isOfflineMode) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.offlineContainer}>
          <Ionicons name="cloud-offline-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.offlineTitle, { color: colors.text }]}>Mode Hors Ligne</Text>
          <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
            L'accueil nécessite une connexion internet pour afficher les derniers épisodes et recommandations.
          </Text>
          <TouchableOpacity
            style={[styles.offlineButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('Downloads' as never)}
          >
            <Text style={styles.offlineButtonText}>Voir mes téléchargements</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderSectionHeader = (title: string, onSeeAll?: () => void) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll}>
          <Text style={[styles.seeAllText, { color: colors.primary }]}>Voir tout</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderEpisodeCard = ({ item }: { item: Episode }) => (
    <TouchableOpacity
      style={[styles.episodeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => playEpisode(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.episodeThumbnail, { backgroundColor: colors.surface }]}>
        <Ionicons name="play" size={32} color={colors.primary} />
      </View>
      
      <View style={styles.episodeInfo}>
        <Text style={[styles.episodeAnimeTitle, { color: colors.text }]} numberOfLines={1}>
          {item.animeTitle}
        </Text>
        <Text style={[styles.episodeTitle, { color: colors.textSecondary }]} numberOfLines={1}>
          Épisode {item.number}: {item.title}
        </Text>
        <Text style={[styles.episodeDuration, { color: colors.textSecondary }]}>
          {Math.round(item.duration / 60)} min
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderAnimeCard = ({ item }: { item: Anime }) => (
    <TouchableOpacity
      style={[styles.animeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigateToAnimeDetail(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.animeThumbnail, { backgroundColor: colors.surface }]}>
        <Text style={[styles.animeInitial, { color: colors.textSecondary }]}>
          {item.title[0]}
        </Text>
      </View>
      
      <Text style={[styles.animeTitle, { color: colors.text }]} numberOfLines={2}>
        {item.title}
      </Text>
      
      <View style={styles.animeMetadata}>
        <Text style={[styles.animeYear, { color: colors.textSecondary }]}>
          {item.year}
        </Text>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={12} color="#fbbf24" />
          <Text style={[styles.animeRating, { color: colors.textSecondary }]}>
            {item.rating.toFixed(1)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderContinueCard = ({ item }: { item: Anime }) => (
    <TouchableOpacity
      style={[styles.continueCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigateToAnimeDetail(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.continueThumbnail, { backgroundColor: colors.surface }]}>
        <Text style={[styles.continueInitial, { color: colors.textSecondary }]}>
          {item.title[0]}
        </Text>
      </View>
      
      <View style={styles.continueInfo}>
        <Text style={[styles.continueTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.continueProgress, { color: colors.textSecondary }]}>
          Continuer à regarder
        </Text>
      </View>
      
      <View style={[styles.playIcon, { backgroundColor: colors.primary }]}>
        <Ionicons name="play" size={16} color="white" />
      </View>
    </TouchableOpacity>
  );

  const renderSkeletonCard = (width: number, height: number) => (
    <View style={[styles.skeletonCard, { width, height, backgroundColor: colors.surface }]} />
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Accueil</Text>
          </View>

          {/* Sections de loading */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.skeletonText, { backgroundColor: colors.surface }]} />
            </View>
            <FlatList
              horizontal
              data={[1, 2, 3]}
              keyExtractor={(item) => item.toString()}
              renderItem={() => renderSkeletonCard(280, 100)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.skeletonText, { backgroundColor: colors.surface }]} />
            </View>
            <FlatList
              horizontal
              data={[1, 2, 3, 4]}
              keyExtractor={(item) => item.toString()}
              renderItem={() => renderSkeletonCard(140, 200)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Accueil</Text>
          <TouchableOpacity
            style={[styles.searchButton, { backgroundColor: colors.surface }]}
            onPress={() => navigation.navigate('Catalog' as never)}
          >
            <Ionicons name="search" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Section Continuer à regarder */}
        {continueWatching.length > 0 && (
          <View style={styles.section}>
            {renderSectionHeader('Continuer à regarder')}
            <FlatList
              horizontal
              data={continueWatching}
              keyExtractor={(item) => item.id}
              renderItem={renderContinueCard}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {/* Section Derniers épisodes */}
        <View style={styles.section}>
          {renderSectionHeader('Derniers épisodes', () => navigation.navigate('Catalog' as never))}
          <FlatList
            horizontal
            data={latestEpisodes}
            keyExtractor={(item) => item.id}
            renderItem={renderEpisodeCard}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            ListEmptyComponent={() => (
              <View style={styles.emptySection}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Aucun épisode récent disponible
                </Text>
              </View>
            )}
          />
        </View>

        {/* Section Recommandés */}
        <View style={styles.section}>
          {renderSectionHeader('Recommandés pour vous', () => navigation.navigate('Catalog' as never))}
          <FlatList
            horizontal
            data={recommendedAnimes}
            keyExtractor={(item) => item.id}
            renderItem={renderAnimeCard}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            ListEmptyComponent={() => (
              <View style={styles.emptySection}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Aucune recommandation disponible
                </Text>
              </View>
            )}
          />
        </View>

        {/* Section Populaires */}
        <View style={[styles.section, styles.lastSection]}>
          {renderSectionHeader('Populaires', () => navigation.navigate('Catalog' as never))}
          <FlatList
            horizontal
            data={recommendedAnimes.slice(0, 8)}
            keyExtractor={(item) => `popular-${item.id}`}
            renderItem={renderAnimeCard}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
  },
  lastSection: {
    marginBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
  },
  horizontalList: {
    paddingHorizontal: 20,
  },
  
  // Cards Continuer à regarder
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 280,
    padding: 12,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
  },
  continueThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  continueInitial: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  continueInfo: {
    flex: 1,
  },
  continueTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  continueProgress: {
    fontSize: 14,
  },
  playIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Cards Épisodes
  episodeCard: {
    width: 280,
    padding: 12,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  episodeThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  episodeInfo: {
    flex: 1,
  },
  episodeAnimeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  episodeTitle: {
    fontSize: 12,
    marginBottom: 4,
  },
  episodeDuration: {
    fontSize: 12,
  },

  // Cards Animés
  animeCard: {
    width: 140,
    padding: 12,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
  },
  animeThumbnail: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  animeInitial: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  animeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 18,
  },
  animeMetadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  animeYear: {
    fontSize: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  animeRating: {
    fontSize: 12,
    marginLeft: 2,
  },

  // États vides et loading
  emptySection: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  skeletonCard: {
    borderRadius: 12,
    marginRight: 12,
  },
  skeletonText: {
    width: 120,
    height: 20,
    borderRadius: 4,
  },

  // Mode hors ligne
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  offlineTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  offlineText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  offlineButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  offlineButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HomeScreenImproved; 