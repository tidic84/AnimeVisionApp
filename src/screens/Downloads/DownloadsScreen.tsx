import { useAppColorScheme as useColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MainTabScreenProps } from '../../types/navigation';
import { useApi } from '../../contexts/ApiContext';
import { DownloadStatus, VideoQuality } from '../../types/anime';
import downloadService, { DownloadItem, DownloadProgress } from '../../services/downloadService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomModal from '../../components/CustomModal';

type DownloadsScreenProps = MainTabScreenProps<'Downloads'>;

const { width: screenWidth } = Dimensions.get('window');

const Colors = palette;

const DownloadsScreen: React.FC<DownloadsScreenProps> = ({ navigation }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isApiAvailable } = useApi();
  const insets = useSafeAreaInsets();

  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'downloading' | 'downloaded' | 'failed'>('all');
  const [storageInfo, setStorageInfo] = useState<{
    totalSize: number;
    availableSize: number;
    usedSize: number;
    downloadCount: number;
  } | null>(null);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadDownloads();
    loadStorageInfo();
  }, []);

  // Mise à jour automatique quand des téléchargements sont actifs
  useEffect(() => {
    const hasActive = downloads.some(d => d.status === DownloadStatus.DOWNLOADING);

    if (hasActive && !intervalId) {
      // Démarrer le polling léger (1 s)
      const id = setInterval(async () => {
        await loadDownloads();
      }, 1000);
      setIntervalId(id);
    }

    if (!hasActive && intervalId) {
      // Arrêter le polling lorsque plus rien n'est actif
      clearInterval(intervalId);
      setIntervalId(null);
    }
  }, [downloads]);

  const loadDownloads = async () => {
    try {
      // Ne pas mettre loading à true si on a déjà des téléchargements
      if (downloads.length === 0) {
        setLoading(true);
      }

      const allDownloads = await downloadService.getAllDownloads();
      console.log('[Downloads] 📋 Téléchargements récupérés:', allDownloads.length);
      setDownloads(allDownloads);

      // Nettoyer les téléchargements orphelins
      await downloadService.cleanupOrphanedDownloads();
    } catch (error) {
      console.error('[Downloads] Erreur chargement téléchargements:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStorageInfo = async () => {
    try {
      const info = await downloadService.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('[Downloads] Erreur chargement info stockage:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDownloads(), loadStorageInfo()]);
    setRefreshing(false);
  }, []);

  const getFilteredDownloads = () => {
    switch (selectedTab) {
      case 'downloading':
        return downloads.filter(item =>
          item.status === DownloadStatus.DOWNLOADING || item.status === DownloadStatus.QUEUED
        );
      case 'downloaded':
        return downloads.filter(item => item.status === DownloadStatus.DOWNLOADED);
      case 'failed':
        return downloads.filter(item => item.status === DownloadStatus.FAILED);
      default:
        return downloads;
    }
  };

  const handleCancelDownload = (item: DownloadItem) => {
    Alert.alert(
      'Annuler le téléchargement',
      `Voulez-vous annuler le téléchargement de "${item.episode.title}" ?`,
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadService.cancelDownload(item.episode.id);
              await loadDownloads();
            } catch (error) {
              Alert.alert('Erreur', 'Impossible d\'annuler le téléchargement');
            }
          }
        }
      ]
    );
  };

  const handleDeleteDownload = (item: DownloadItem) => {
    Alert.alert(
      'Supprimer le téléchargement',
      `Voulez-vous supprimer "${item.episode.title}" de vos téléchargements ?`,
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadService.deleteDownload(item.episode.id);
              await Promise.all([loadDownloads(), loadStorageInfo()]);
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de supprimer le téléchargement');
            }
          }
        }
      ]
    );
  };

  const handlePlayDownload = (item: DownloadItem) => {
    if (item.filePath) {
      console.log(`[Downloads] 🎬 Lecture fichier local: ${item.filePath}`);
      navigation.navigate('VideoPlayer', {
        episodeId: item.episode.id,
        animeId: item.episode.animeId,
        autoPlay: true,
        localFilePath: item.filePath, // Passer le chemin du fichier local
        isOfflineMode: true, // Indiquer que c'est en mode hors ligne
      });
    } else {
      console.warn(`[Downloads] ⚠️ Pas de fichier local pour l'épisode ${item.episode.id}`);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return '';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m restant`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s restant`;
    } else {
      return `${secs}s restant`;
    }
  };

  const getStatusColor = (status: DownloadStatus) => {
    switch (status) {
      case DownloadStatus.QUEUED:
        return colors.warning;
      case DownloadStatus.DOWNLOADING:
        return colors.primary;
      case DownloadStatus.DOWNLOADED:
        return colors.success;
      case DownloadStatus.FAILED:
        return colors.error;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: DownloadStatus) => {
    switch (status) {
      case DownloadStatus.QUEUED:
        return 'En attente';
      case DownloadStatus.DOWNLOADING:
        return 'En cours';
      case DownloadStatus.DOWNLOADED:
        return 'Terminé';
      case DownloadStatus.FAILED:
        return 'Échec';
      default:
        return 'Inconnu';
    }
  };

  const renderDownloadItem = ({ item }: { item: DownloadItem }) => {
    const isWaiting = item.status === DownloadStatus.DOWNLOADING && item.progress.status !== 'downloading';
    const displayedStatusText = isWaiting ? 'En attente' : getStatusText(item.status);
    const displayedStatusColor = isWaiting ? colors.textSecondary : getStatusColor(item.status);

    // Calculer la position dans la queue pour les téléchargements en attente
    const queuePosition = item.status === DownloadStatus.QUEUED ?
      downloads.filter(d => d.status === DownloadStatus.QUEUED).findIndex(d => d.episode.id === item.episode.id) + 1 : 0;

    return (
    <TouchableOpacity
      style={[styles.downloadCard, { backgroundColor: 'transparent' }]}
      onPress={() => item.status === DownloadStatus.DOWNLOADED && handlePlayDownload(item)}
      activeOpacity={item.status === DownloadStatus.DOWNLOADED ? 0.7 : 1}
    >
      <View style={styles.downloadThumbnail}>
        {item.episode.thumbnail ? (
          <Image
            source={{ uri: item.episode.thumbnail }}
            style={styles.downloadPoster}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.downloadPlaceholder, { backgroundColor: colors.surface }]}>
            <Ionicons name="film" size={24} color={colors.textSecondary} />
          </View>
        )}

        {item.status === DownloadStatus.DOWNLOADED && (
          <View style={styles.playOverlay}>
            <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.9)" />
          </View>
        )}
      </View>

      <View style={styles.downloadInfo}>
        <Text style={[styles.downloadTitle, { color: colors.text }]} numberOfLines={2}>
          {item.episode.title}
        </Text>

        <Text style={[styles.downloadAnime, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.episode.animeTitle || 'Anime inconnu'}
        </Text>

        <View style={styles.downloadMeta}>
            <View style={[styles.statusBadge, { backgroundColor: displayedStatusColor + '20' }]}>
              <Text style={[styles.statusText, { color: displayedStatusColor }]}>{displayedStatusText}</Text>
          </View>
            <Text style={[styles.qualityText, { color: colors.textSecondary }]}> {item.quality} </Text>
        </View>

        {(item.status === DownloadStatus.DOWNLOADING || item.status === DownloadStatus.QUEUED) && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                      backgroundColor: item.status === DownloadStatus.QUEUED ? colors.warning : (isWaiting ? colors.textSecondary : colors.primary),
                      width: item.status === DownloadStatus.QUEUED ? '100%' : `${item.progress.progress}%`,
                      opacity: item.status === DownloadStatus.QUEUED ? 0.3 : 1,
                    },
                ]}
              />
            </View>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                {item.status === DownloadStatus.QUEUED ?
                  (queuePosition > 1 ? `En attente (${queuePosition}e)` : 'En attente (prochain)') :
                  (isWaiting ? '...' : `${Math.round(item.progress.progress)}%`)
                }
              </Text>
          </View>
        )}

          {item.status === DownloadStatus.DOWNLOADING && !isWaiting && item.progress.timeRemaining > 0 && (
            <Text style={[styles.timeRemainingText, { color: colors.textSecondary }]}> {formatTimeRemaining(item.progress.timeRemaining)} </Text>
        )}

        {item.status === DownloadStatus.DOWNLOADED && item.fileSize && (
          <Text style={[styles.fileSizeText, { color: colors.textSecondary }]}>
            {formatFileSize(item.fileSize)}
          </Text>
        )}
      </View>

      <View style={styles.downloadActions}>
        {(item.status === DownloadStatus.DOWNLOADING || item.status === DownloadStatus.QUEUED) && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
            onPress={() => handleCancelDownload(item)}
          >
            <Ionicons name="close" size={20} color={colors.error} />
          </TouchableOpacity>
        )}

        {(item.status === DownloadStatus.DOWNLOADED || item.status === DownloadStatus.FAILED) && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
            onPress={() => handleDeleteDownload(item)}
          >
            <Ionicons name="trash" size={20} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
  };

  const renderStorageModal = () => (
    <CustomModal
      visible={showStorageModal}
      onRequestClose={() => setShowStorageModal(false)}
      alignment="bottom"
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Stockage</Text>
          <TouchableOpacity onPress={() => setShowStorageModal(false)}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {storageInfo && (
            <View>
              <View style={styles.storageCard}>
                <Text style={[styles.storageTitle, { color: colors.text }]}>
                  Espace utilisé par les téléchargements
                </Text>
                <Text style={[styles.storageValue, { color: colors.primary }]}>
                  {formatFileSize(storageInfo.usedSize)}
                </Text>
              </View>

              <View style={styles.storageCard}>
                <Text style={[styles.storageTitle, { color: colors.text }]}>
                  Espace disponible
                </Text>
                <Text style={[styles.storageValue, { color: colors.success }]}>
                  {formatFileSize(storageInfo.availableSize)}
                </Text>
              </View>

              <View style={styles.storageCard}>
                <Text style={[styles.storageTitle, { color: colors.text }]}>
                  Nombre de téléchargements
                </Text>
                <Text style={[styles.storageValue, { color: colors.text }]}>
                  {storageInfo.downloadCount}
                </Text>
              </View>

              <View style={styles.storageProgress}>
                <Text style={[styles.storageProgressTitle, { color: colors.text }]}>
                  Utilisation du stockage
                </Text>
                <View style={[styles.storageProgressBar, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.storageProgressFill,
                      {
                        backgroundColor: colors.buttonBg,
                        width: `${Math.min((storageInfo.usedSize / storageInfo.totalSize) * 100, 100)}%`
                      }
                    ]}
                  />
                </View>
                <Text style={[styles.storageProgressText, { color: colors.textSecondary }]}>
                  {Math.round((storageInfo.usedSize / storageInfo.totalSize) * 100)}% utilisé
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </CustomModal>
  );

  const renderTabs = () => (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      {[
        { key: 'all', label: 'Tous', count: downloads.length },
        { key: 'downloading', label: 'En cours', count: downloads.filter(d => d.status === DownloadStatus.DOWNLOADING || d.status === DownloadStatus.QUEUED).length },
        { key: 'downloaded', label: 'Terminés', count: downloads.filter(d => d.status === DownloadStatus.DOWNLOADED).length },
        { key: 'failed', label: 'Échecs', count: downloads.filter(d => d.status === DownloadStatus.FAILED).length },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tab,
            selectedTab === tab.key && { backgroundColor: colors.buttonBg }
          ]}
          onPress={() => setSelectedTab(tab.key as any)}
        >
          <Text style={[
            styles.tabText,
            { color: selectedTab === tab.key ? 'white' : colors.text }
          ]}>
            {tab.label}
          </Text>
          {tab.count > 0 && (
            <View style={[
              styles.tabBadge,
              { backgroundColor: selectedTab === tab.key ? 'rgba(255,255,255,0.3)' : colors.primary }
            ]}>
              <Text style={[
                styles.tabBadgeText,
                { color: selectedTab === tab.key ? 'white' : 'white' }
              ]}>
                {tab.count}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Téléchargements</Text>
      <TouchableOpacity
        style={[styles.storageButton, { backgroundColor: colors.surface }]}
        onPress={() => setShowStorageModal(true)}
      >
        <Ionicons name="server" size={20} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="download" size={80} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {selectedTab === 'all' ? 'Aucun téléchargement' :
         selectedTab === 'downloading' ? 'Aucun téléchargement en cours' :
         selectedTab === 'downloaded' ? 'Aucun téléchargement terminé' :
         'Aucun téléchargement échoué'}
      </Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        {selectedTab === 'all' ?
          'Téléchargez des épisodes depuis les pages d\'animés pour les regarder hors ligne' :
          'Les téléchargements de cette catégorie apparaîtront ici'
        }
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Chargement des téléchargements...
          </Text>
      </View>
      </SafeAreaView>
    );
  }

  const filteredDownloads = getFilteredDownloads();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}
      {renderTabs()}

      {filteredDownloads.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={filteredDownloads}
          renderItem={renderDownloadItem}
          keyExtractor={(item, index) => `${item.progress.downloadId || item.episode.id}_${item.quality}_${index}`}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        />
      )}

      {renderStorageModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  storageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100, // Increased to account for navbar
  },
  downloadCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 20,
    marginBottom: 12,
  },
  downloadThumbnail: {
    width: 80,
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  downloadPoster: {
    width: '100%',
    height: '100%',
  },
  downloadPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  downloadInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'flex-start',
    paddingVertical: 4,
  },
  downloadTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 6,
  },
  downloadAnime: {
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 18,
  },
  downloadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  qualityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
    minWidth: 35,
  },
  fileSizeText: {
    fontSize: 12,
  },
  timeRemainingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  downloadActions: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  storageCard: {
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
  },
  storageTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  storageValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  storageProgress: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
  },
  storageProgressTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  storageProgressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  storageProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  storageProgressText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default DownloadsScreen;
