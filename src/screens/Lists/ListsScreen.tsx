import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  SafeAreaView,
  useColorScheme,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MainTabScreenProps } from '../../types/navigation';
import { AnimeList, Anime, WatchStatus } from '../../types/anime';
import databaseService from '../../services/databaseService';
import apiService from '../../services/apiService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ListsScreenProps = MainTabScreenProps<'Lists'>;

const { width: screenWidth } = Dimensions.get('window');

const Colors = {
  light: {
    primary: '#6366f1',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    card: '#ffffff',
    danger: '#dc2626',
    success: '#16a34a',
  },
  dark: {
    primary: '#818cf8',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    card: '#1e293b',
    danger: '#ef4444',
    success: '#22c55e',
  },
};

interface ListWithAnimes extends AnimeList {
  animes: Anime[];
  animeCount: number;
}

const ListsScreen: React.FC<ListsScreenProps> = ({ navigation }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  
  const [lists, setLists] = useState<ListWithAnimes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingList, setEditingList] = useState<AnimeList | null>(null);
  const [newListName, setNewListName] = useState('');

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      setLoading(true);
      
      // Charger toutes les listes
      const userLists = await databaseService.getAllLists();
      
      // Charger les animés pour chaque liste
      const listsWithAnimes = await Promise.all(
        userLists.map(async (list) => {
          const animes = await databaseService.getAnimesInList(list.id);
          return {
            ...list,
            animes,
            animeCount: animes.length,
          };
        })
      );

      // Trier : liste par défaut en premier, puis par date de création
      listsWithAnimes.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setLists(listsWithAnimes);
    } catch (error) {
      console.error('[Lists] Erreur lors du chargement des listes:', error);
      Alert.alert('Erreur', 'Impossible de charger les listes');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLists();
    setRefreshing(false);
  }, []);

  const createList = async () => {
    if (!newListName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom pour la liste');
      return;
    }

    try {
      await databaseService.createList(newListName.trim());
      setNewListName('');
      setShowCreateModal(false);
      await loadLists();
      Alert.alert('Succès', 'Liste créée avec succès');
    } catch (error) {
      console.error('[Lists] Erreur lors de la création de la liste:', error);
      Alert.alert('Erreur', 'Impossible de créer la liste');
    }
  };

  const editList = async () => {
    if (!editingList || !newListName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom pour la liste');
      return;
    }

    try {
      await databaseService.updateListName(editingList.id, newListName.trim());
      setNewListName('');
      setShowEditModal(false);
      setEditingList(null);
      await loadLists();
      Alert.alert('Succès', 'Liste modifiée avec succès');
    } catch (error) {
      console.error('[Lists] Erreur lors de la modification de la liste:', error);
      Alert.alert('Erreur', 'Impossible de modifier la liste');
    }
  };

  const deleteList = (list: AnimeList) => {
    if (list.isDefault) {
      Alert.alert('Erreur', 'Impossible de supprimer la liste par défaut');
      return;
    }

    Alert.alert(
      'Supprimer la liste',
      `Êtes-vous sûr de vouloir supprimer "${list.name}" ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseService.deleteList(list.id);
              await loadLists();
              Alert.alert('Succès', 'Liste supprimée avec succès');
            } catch (error) {
              console.error('[Lists] Erreur lors de la suppression de la liste:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la liste');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (list: AnimeList) => {
    if (list.isDefault) {
      Alert.alert('Info', 'Impossible de modifier la liste par défaut');
      return;
    }
    setEditingList(list);
    setNewListName(list.name);
    setShowEditModal(true);
  };

  const navigateToListDetail = (list: ListWithAnimes) => {
    // TODO: Naviguer vers l'écran de détail de la liste
    // navigation.navigate('ListDetail', { listId: list.id });
    Alert.alert('Info', `Ouverture de la liste "${list.name}" avec ${list.animeCount} animé(s)`);
  };

  const getStatusColor = (status: WatchStatus) => {
    switch (status) {
      case WatchStatus.WATCHING:
        return colors.primary;
      case WatchStatus.COMPLETED:
        return colors.success;
      case WatchStatus.ON_HOLD:
        return '#f59e0b';
      case WatchStatus.DROPPED:
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: WatchStatus) => {
    switch (status) {
      case WatchStatus.WATCHING:
        return 'En cours';
      case WatchStatus.COMPLETED:
        return 'Terminé';
      case WatchStatus.ON_HOLD:
        return 'En pause';
      case WatchStatus.DROPPED:
        return 'Abandonné';
      default:
        return 'Pas commencé';
    }
  };

  const renderListItem = ({ item }: { item: ListWithAnimes }) => (
    <TouchableOpacity
      style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigateToListDetail(item)}
      activeOpacity={0.7}
    >
      <View style={styles.listHeader}>
        <View style={styles.listTitleContainer}>
          <Text style={[styles.listTitle, { color: colors.text }]}>{item.name}</Text>
          {item.isDefault && (
            <View style={[styles.defaultBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.defaultBadgeText}>Par défaut</Text>
            </View>
          )}
        </View>
        
        {!item.isDefault && (
          <View style={styles.listActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => openEditModal(item)}
            >
              <Ionicons name="pencil" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => deleteList(item)}
            >
              <Ionicons name="trash" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={[styles.animeCount, { color: colors.textSecondary }]}>
        {item.animeCount} animé{item.animeCount !== 1 ? 's' : ''}
      </Text>

      {item.animes.length > 0 && (
        <View style={styles.animePreview}>
          <FlatList
            data={item.animes.slice(0, 3)}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(anime) => anime.id}
            renderItem={({ item: anime }) => (
              <View style={styles.animePreviewItem}>
                <View style={[styles.animeThumbnail, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.animeInitial, { color: colors.textSecondary }]}>
                    {anime.title[0]}
                  </Text>
                </View>
                <Text
                  style={[styles.animeTitle, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {anime.title}
                </Text>
              </View>
            )}
          />
          {item.animes.length > 3 && (
            <Text style={[styles.moreAnimes, { color: colors.textSecondary }]}>
              +{item.animes.length - 3} autres
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  const renderCreateModal = () => (
    <Modal
      visible={showCreateModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCreateModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Créer une nouvelle liste
          </Text>
          
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Nom de la liste"
            placeholderTextColor={colors.textSecondary}
            value={newListName}
            onChangeText={setNewListName}
            autoFocus
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => {
                setNewListName('');
                setShowCreateModal(false);
              }}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                Annuler
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.createButton, { backgroundColor: colors.primary }]}
              onPress={createList}
            >
              <Text style={styles.createButtonText}>Créer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderEditModal = () => (
    <Modal
      visible={showEditModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowEditModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Modifier la liste
          </Text>
          
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Nom de la liste"
            placeholderTextColor={colors.textSecondary}
            value={newListName}
            onChangeText={setNewListName}
            autoFocus
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => {
                setNewListName('');
                setShowEditModal(false);
                setEditingList(null);
              }}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                Annuler
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.createButton, { backgroundColor: colors.primary }]}
              onPress={editList}
            >
              <Text style={styles.createButtonText}>Modifier</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Mes Listes</Text>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: colors.primary }]}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name="add" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Chargement des listes...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}

      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={renderListItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Ionicons name="list-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Aucune liste
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Créez votre première liste pour organiser vos animés
            </Text>
            <TouchableOpacity
              style={[styles.createFirstButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.createFirstButtonText}>Créer une liste</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {renderCreateModal()}
      {renderEditModal()}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  listCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  listTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  defaultBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  listActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  animeCount: {
    fontSize: 14,
    marginBottom: 12,
  },
  animePreview: {
    marginTop: 8,
  },
  animePreviewItem: {
    marginRight: 12,
    width: 60,
  },
  animeThumbnail: {
    width: 60,
    height: 80,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  animeInitial: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  animeTitle: {
    fontSize: 12,
    textAlign: 'center',
  },
  moreAnimes: {
    fontSize: 12,
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  createFirstButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createFirstButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: screenWidth - 40,
    borderRadius: 12,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    marginRight: 8,
  },
  createButton: {
    marginLeft: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ListsScreen; 