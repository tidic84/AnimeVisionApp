import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Modal, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MainTabScreenProps } from '../../types/navigation';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';
import { Anime, DownloadStatus } from '../../types/anime';
import downloadService, { DownloadItem } from '../../services/downloadService';
import databaseService from '../../services/databaseService';
import { FadeIn } from '../../components/Motion';
import useReducedMotion from '../../hooks/useReducedMotion';

type Navigation = MainTabScreenProps<'Downloads'>['navigation'] | MainTabScreenProps<'Lists'>['navigation'];
type Group = { id: string; title: string; poster: string; items: DownloadItem[] };
const formatBytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} Go` : `${Math.round(bytes / 1024 ** 2)} Mo`;
export function DownloadsContent({ navigation, embedded = false }: { navigation: Navigation; embedded?: boolean }) {
  const colors = palette[useAppColorScheme()];
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [animes, setAnimes] = useState<Record<string, Anime>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof downloadService.getStorageInfo>> | null>(null);
  const [showStorage, setShowStorage] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [items, info] = await Promise.all([downloadService.getAllDownloads(), downloadService.getStorageInfo()]);
      setDownloads(items); setStorage(info); setError('');
      const animeIds = [...new Set(items.map(item => item.episode.animeId))];
      const records = await Promise.all(animeIds.map(async id => [id, await databaseService.getAnime(id)] as const));
      setAnimes(Object.fromEntries(records.filter((entry): entry is readonly [string, Anime] => entry[1] !== null)));
    } catch { setError('Impossible de charger les téléchargements. Réessayez.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const active = downloads.some(item => item.status === DownloadStatus.DOWNLOADING || item.status === DownloadStatus.QUEUED);
  useEffect(() => { if (!active) return; const timer = setInterval(() => void load(), 1500); return () => clearInterval(timer); }, [active, load]);
  const groups: Group[] = Object.values(downloads.reduce<Record<string, Group>>((result, item) => {
    const id = item.episode.animeId;
    if (!result[id]) result[id] = { id, title: animes[id]?.title || item.episode.animeTitle || 'Animé téléchargé', poster: animes[id]?.thumbnail || item.episode.anime_poster || item.episode.thumbnail, items: [] };
    result[id].items.push(item); return result;
  }, {}));
  const selected = groups.find(group => group.id === selectedId);
  const deleteItem = async (item: DownloadItem) => {
    setRemoving(item.episode.id);
    try {
      if (item.status === DownloadStatus.DOWNLOADING || item.status === DownloadStatus.QUEUED) await downloadService.cancelDownload(item.episode.id, item.quality);
      else await downloadService.deleteDownload(item.episode.id, item.quality);
      await load();
    } catch { setError('Impossible de supprimer ce téléchargement.'); }
    finally { setRemoving(null); }
  };
  const play = (item: DownloadItem) => {
    if (!item.filePath || item.status !== DownloadStatus.DOWNLOADED) return;
    navigation.navigate('VideoPlayer', { episodeId: item.episode.id, animeId: item.episode.animeId, localFilePath: item.filePath, isOfflineMode: true, autoPlay: true });
  };
  const cardWidth = (Math.min(width, 1000) - 44) / 2;
  return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: embedded ? 0 : insets.top }]}>
    {!embedded && <View style={styles.header}><Text style={[styles.title, { color: colors.text }]}>Téléchargements</Text><TouchableOpacity accessibilityLabel="Informations de stockage" onPress={() => setShowStorage(true)} style={styles.iconButton}><Ionicons name="server-outline" size={26} color={colors.text} /></TouchableOpacity></View>}
    <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
      {selected ? <TouchableOpacity onPress={() => setSelectedId(null)} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.text} /><Text style={[styles.groupTitle, { color: colors.text }]} numberOfLines={1}>{selected.title}</Text></TouchableOpacity> : <TouchableOpacity onPress={() => setShowStorage(true)}><Text style={{ color: colors.textSecondary, fontSize: 13 }}>{storage ? `${storage.downloadCount} épisodes • ${formatBytes(storage.usedSize)}` : 'Stockage'}</Text></TouchableOpacity>}
      <TouchableOpacity onPress={() => setManage(!manage)} style={styles.iconButton}><Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{manage ? 'Terminer' : 'Gérer'}</Text></TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}>
      {!!error && <TouchableOpacity onPress={load}><Text style={{ color: colors.danger, paddingVertical: 12 }}>{error}</Text></TouchableOpacity>}
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : <FadeIn key={selectedId ?? 'groups'}>
        {selected ? selected.items.sort((a, b) => a.episode.number - b.episode.number).map(item => {
          const ready = item.status === DownloadStatus.DOWNLOADED;
          const downloading = item.status === DownloadStatus.DOWNLOADING;
          const progress = Math.min(100, Math.max(0, item.progress.progress));
          const status = ready ? `${item.quality} • ${formatBytes(item.fileSize ?? 0)}` : downloading ? `Téléchargement • ${Math.round(progress)} %` : item.status === DownloadStatus.QUEUED ? 'En attente' : 'Échec du téléchargement';
          return <View key={`${item.episode.id}-${item.quality}`} style={[styles.episode, { borderBottomColor: colors.border }]}><TouchableOpacity style={{ width: 110 }} onPress={() => play(item)} disabled={!ready} accessibilityLabel={`Lire l’épisode ${item.episode.number}`}><Image source={{ uri: item.episode.thumbnail || selected.poster }} style={[styles.episodeImage, { backgroundColor: colors.surface }]} />{ready && <View style={styles.playOverlay}><Ionicons name="play" size={26} color="white" /></View>}</TouchableOpacity><View style={{ flex: 1 }}><TouchableOpacity disabled={!ready} onPress={() => play(item)}><Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }} numberOfLines={2}>E{item.episode.number} • {item.episode.title}</Text></TouchableOpacity><Text style={{ color: item.status === DownloadStatus.FAILED ? colors.danger : colors.textSecondary, fontSize: 12, marginTop: 8 }}>{status}</Text>{downloading && <View style={[styles.progress, { backgroundColor: colors.border }]}><View style={{ height: 3, width: `${progress}%`, backgroundColor: colors.primary }} /></View>}</View>{(item.status !== DownloadStatus.DOWNLOADING && (manage || !ready)) && <TouchableOpacity disabled={removing !== null} onPress={() => deleteItem(item)} style={styles.iconButton} accessibilityLabel={`${ready || item.status === DownloadStatus.FAILED ? 'Supprimer' : 'Annuler'} l’épisode ${item.episode.number}`}><Ionicons name={ready || item.status === DownloadStatus.FAILED ? 'trash-outline' : 'close-outline'} color={colors.textSecondary} size={23} /></TouchableOpacity>}</View>;
        }) : <View style={styles.grid}>{groups.map(group => <View key={group.id} style={{ width: cardWidth, marginBottom: 28 }}><TouchableOpacity onPress={() => setSelectedId(group.id)} accessibilityLabel={`Ouvrir les téléchargements de ${group.title}`}><Image source={{ uri: group.poster }} style={[styles.poster, { backgroundColor: colors.surface }]} /><Text style={[styles.groupTitle, { color: colors.text, marginTop: 10 }]} numberOfLines={2}>{group.title}</Text><Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>{group.items.length} épisode{group.items.length > 1 ? 's' : ''}{group.items.some(item => item.status !== DownloadStatus.DOWNLOADED) ? ' • En cours' : ''}</Text></TouchableOpacity>{manage && <TouchableOpacity onPress={() => setSelectedId(group.id)} style={{ paddingTop: 12 }}><Text style={{ color: colors.primary }}>Gérer les épisodes</Text></TouchableOpacity>}</View>)}</View>}
        {!groups.length && <View style={styles.empty}><Ionicons name="download-outline" size={40} color={colors.textSecondary} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Vos animés, même hors ligne</Text><Text style={[styles.emptyText, { color: colors.textSecondary }]}>{Platform.OS === 'web' ? 'Les téléchargements sont disponibles dans l’application mobile. Retrouvez ici les épisodes téléchargés sur votre appareil.' : 'Téléchargez des épisodes depuis la fiche d’un animé pour les retrouver ici.'}</Text><TouchableOpacity onPress={() => navigation.navigate('Catalog')} style={styles.discover}><Text style={{ color: colors.primary, fontWeight: '700' }}>DÉCOUVRIR LES ANIMÉS</Text></TouchableOpacity></View>}
      </FadeIn>}
    </ScrollView>
    <Modal visible={showStorage} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setShowStorage(false)}><View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: colors.surface }]}><View style={styles.modalHeader}><Text style={[styles.groupTitle, { color: colors.text }]}>Stockage</Text><TouchableOpacity accessibilityLabel="Fermer le stockage" onPress={() => setShowStorage(false)} style={styles.iconButton}><Ionicons name="close" size={25} color={colors.text} /></TouchableOpacity></View>{storage && <><Text style={[styles.storageValue, { color: colors.primary }]}>{formatBytes(storage.usedSize)}</Text><Text style={{ color: colors.textSecondary, lineHeight: 24 }}>utilisés par {storage.downloadCount} épisodes</Text><Text style={{ color: colors.text, marginTop: 24 }}>{formatBytes(storage.availableSize)} disponibles</Text></>}</View></View></Modal>
  </View>;
}
export default function DownloadsScreen({ navigation }: MainTabScreenProps<'Downloads'>) { return <DownloadsContent navigation={navigation} />; }
const styles = StyleSheet.create({ root: { flex: 1 }, header: { paddingHorizontal: 18, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 27, fontWeight: '700' }, iconButton: { padding: 10 }, toolbar: { paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 66 }, back: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 5 }, content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 32, maxWidth: 1000, width: '100%', alignSelf: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, poster: { width: '100%', aspectRatio: 2 / 3 }, groupTitle: { fontSize: 17, lineHeight: 25, flexShrink: 1 }, episode: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth }, episodeImage: { width: 110, aspectRatio: 16 / 9 }, playOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' }, progress: { height: 3, marginTop: 10 }, empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 20 }, emptyTitle: { fontSize: 20, fontWeight: '600', marginTop: 20, textAlign: 'center' }, emptyText: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 14 }, discover: { padding: 18, marginTop: 20 }, backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }, modal: { width: '100%', maxWidth: 420, padding: 24 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, storageValue: { fontSize: 36, fontWeight: '700', marginTop: 24 } });
