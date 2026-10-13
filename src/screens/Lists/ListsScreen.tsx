import { radii } from '../../theme/shape';
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';
import { MainTabScreenProps } from '../../types/navigation';
import { Anime, AnimeList, Episode, WatchHistory } from '../../types/anime';
import databaseService from '../../services/databaseService';
import { FadeIn, LoadingSwap } from '../../components/Motion';
import { SkeletonBlock, SkeletonGroup } from '../../components/SkeletonCard/SkeletonCard';
import useReducedMotion from '../../hooks/useReducedMotion';
import { DownloadsContent } from '../Downloads/DownloadsScreen';

type ListData = AnimeList & { animes: Anime[] };
type HistoryData = WatchHistory & { anime: Anime; episode: Episode | undefined };
const tabs = ['Watchlist', 'Collections', 'Historique', 'Téléchargements'] as const;

export default function ListsScreen({ navigation }: MainTabScreenProps<'Lists'>) {
  const colors = palette[useAppColorScheme()];
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<typeof tabs[number]>('Watchlist');
  const [lists, setLists] = useState<ListData[]>([]);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<AnimeList | 'new' | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState(false);
  const [manage, setManage] = useState(false);
  const load = useCallback(async () => {
    try {
      setError('');
      const userLists = await databaseService.getAllLists();
      setLists(await Promise.all(userLists.map(async list => ({ ...list, animes: await databaseService.getAnimesInList(list.id) }))));
      const entries = await databaseService.getWatchHistory(100);
      const resolved = await Promise.all(entries.map(async entry => {
        const anime = await databaseService.getAnime(entry.animeId);
        if (!anime) return null;
        const episodes = await databaseService.getAnimeEpisodes(entry.animeId);
        return { ...entry, anime, episode: episodes.find(ep => ep.id === entry.episodeId) };
      }));
      setHistory(resolved.filter((entry): entry is HistoryData => entry !== null));
    } catch { setError('Impossible de charger vos listes. Réessayez.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const watchlist = lists.find(list => list.isDefault);
  const selected = lists.find(list => list.id === selectedId);
  const animes = (selected?.animes ?? watchlist?.animes ?? []).slice().sort((a, b) => sort ? a.title.localeCompare(b.title, 'fr') : 0);
  const collections = lists.filter(list => !list.isDefault);
  const save = async () => {
    if (!name.trim() || !editor || saving) return;
    setSaving(true);
    try {
      if (editor === 'new') await databaseService.createList(name.trim());
      else await databaseService.updateListName(editor.id, name.trim());
      setEditor(null); setName(''); await load();
    } catch { setError('La liste n’a pas pu être enregistrée.'); }
    finally { setSaving(false); }
  };
  const remove = async (anime: Anime) => {
    const list = selected ?? watchlist;
    if (!list) return;
    try { await databaseService.removeAnimeFromList(list.id, anime.id); await load(); }
    catch { setError('Impossible de retirer cet animé.'); }
  };
  const openEditor = (list: AnimeList | 'new') => { setEditor(list); setName(list === 'new' ? '' : list.name); };
  const empty = (title: string, subtitle: string) => <View style={styles.empty}><Ionicons name={tab === 'Historique' ? 'time-outline' : 'bookmark-outline'} size={40} color={colors.textSecondary} /><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyText, { color: colors.textSecondary }]}>{subtitle}</Text></View>;
  const animeRow = (anime: Anime, picker = false) => <View key={anime.id} style={styles.animeRow}>
    <TouchableOpacity onPress={() => picker ? void (async () => { if (!selected) return; await databaseService.addAnimeToList(selected.id, anime.id); await load(); })().catch(() => setError('Impossible d’ajouter cet animé.')) : navigation.navigate('AnimeDetail', { animeId: anime.id })} style={styles.posterButton} accessibilityLabel={picker ? `Ajouter ${anime.title}` : anime.title}>
      <Image source={{ uri: anime.thumbnail }} style={[styles.poster, { backgroundColor: colors.surface }]} />
    </TouchableOpacity>
    <View style={styles.rowInfo}>
      <TouchableOpacity onPress={() => navigation.navigate('AnimeDetail', { animeId: anime.id })}><Text style={[styles.animeTitle, { color: colors.text }]} numberOfLines={2}>{anime.title}</Text></TouchableOpacity>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>{anime.episodeCount > 0 ? `${anime.episodeCount} épisodes` : 'Voir les épisodes'}</Text>
      <View style={styles.rowBottom}><Text style={[styles.meta, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{anime.genres.slice(0, 2).join(' • ')}</Text>
        <TouchableOpacity accessibilityLabel={picker ? `Ajouter ${anime.title} à ${selected?.name}` : `Retirer ${anime.title} de la liste`} style={styles.iconButton} onPress={() => picker ? void (async () => { if (!selected) return; await databaseService.addAnimeToList(selected.id, anime.id); await load(); })().catch(() => setError('Impossible d’ajouter cet animé.')) : void remove(anime)}><Ionicons name={picker ? 'add-outline' : 'bookmark'} size={26} color={colors.primary} /></TouchableOpacity>
      </View>
    </View>
  </View>;
  const historyWidth = Math.max(120, (Math.min(width, 1000) - 44) / 2);
  return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <View style={styles.header}><Text style={[styles.title, { color: colors.text }]}>Mes listes</Text><TouchableOpacity accessibilityLabel="Rechercher un animé" onPress={() => navigation.navigate('Catalog')} style={styles.iconButton}><Ionicons name="search-outline" size={27} color={colors.text} /></TouchableOpacity></View>
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{tabs.map(label => <TouchableOpacity key={label} accessibilityRole="tab" accessibilityState={{ selected: tab === label }} onPress={() => { setTab(label); setSelectedId(null); setAdding(false); }} style={[styles.tab, { borderBottomColor: tab === label ? colors.primary : 'transparent' }]}><Text style={[styles.tabText, { color: tab === label ? colors.text : colors.textSecondary }]}>{label}</Text></TouchableOpacity>)}</ScrollView></View>
    {tab === 'Téléchargements' ? <DownloadsContent navigation={navigation} embedded /> : <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />} contentContainerStyle={styles.content}>
      {error ? <TouchableOpacity onPress={load}><Text style={{ color: colors.danger, paddingVertical: 16 }}>{error}</Text></TouchableOpacity> : null}
      <LoadingSwap loading={loading} skeleton={<SkeletonGroup><View style={{ paddingTop: 18, gap: 20 }}>{[0, 1, 2].map(index => <View key={index} style={{ flexDirection: "row", gap: 18 }}><SkeletonBlock width={88} height={132} /><View style={{ flex: 1, gap: 14, paddingTop: 8 }}><SkeletonBlock height={22} /><SkeletonBlock width="60%" height={16} /><SkeletonBlock width="80%" height={16} /></View></View>)}</View></SkeletonGroup>}><FadeIn key={`${tab}-${selectedId}`}>
        {tab === 'Watchlist' || (tab === 'Collections' && selected) ? <>
          <View style={styles.toolbar}>{selected ? <TouchableOpacity onPress={() => { setSelectedId(null); setAdding(false); }} style={styles.back}><Ionicons name="chevron-back" size={22} color={colors.text} /><Text style={[styles.toolbarTitle, { color: colors.text }]} numberOfLines={1}>{selected.name}</Text></TouchableOpacity> : <Text style={[styles.toolbarTitle, { color: colors.text }]}>{sort ? 'Ordre alphabétique' : 'Activité récente'}</Text>}
            <TouchableOpacity onPress={() => selected ? setAdding(!adding) : setSort(!sort)} accessibilityLabel={selected ? 'Ajouter des animés à la collection' : 'Changer le tri'} style={styles.iconButton}><Ionicons name={selected ? (adding ? 'close' : 'add') : 'filter-outline'} size={26} color={colors.text} /></TouchableOpacity>
          </View>
          {adding ? <><Text style={[styles.meta, { color: colors.textSecondary, marginBottom: 16 }]}>Ajouter depuis votre Watchlist</Text>{(watchlist?.animes ?? []).filter(anime => !selected?.animeIds.includes(anime.id)).map(anime => animeRow(anime, true))}{!(watchlist?.animes ?? []).some(anime => !selected?.animeIds.includes(anime.id)) && empty('Aucun animé à ajouter', 'Ajoutez des animés à votre Watchlist depuis leur fiche.')}</> : animes.length ? animes.map(anime => animeRow(anime)) : empty(selected ? 'Cette collection est vide' : 'Votre Watchlist vous attend', selected ? 'Touchez + pour ajouter des animés depuis votre Watchlist.' : 'Enregistrez les animés qui vous plaisent depuis leur fiche.')}
        </> : tab === 'Collections' ? <>
          <View style={styles.toolbar}><Text style={[styles.meta, { color: colors.textSecondary }]}>{collections.length} liste{collections.length !== 1 ? 's' : ''}</Text><TouchableOpacity onPress={() => openEditor('new')}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>Créer une nouvelle liste</Text></TouchableOpacity></View>
          {collections.map(list => <View key={list.id} style={[styles.collection, { backgroundColor: colors.surface }]}><TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedId(list.id)}><Text style={[styles.collectionName, { color: colors.text }]}>{list.name}</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>{list.animes.length} animé{list.animes.length !== 1 ? 's' : ''} • {list.updatedAt.toLocaleDateString('fr-FR')}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel={`Modifier ${list.name}`} style={styles.iconButton} onPress={() => openEditor(list)}><Ionicons name="ellipsis-vertical" size={22} color={colors.text} /></TouchableOpacity></View>)}
          {!collections.length && empty('Vos collections', 'Créez des listes pour organiser vos prochaines découvertes.')}
        </> : <>
          <View style={styles.toolbar}><Text style={[styles.meta, { color: colors.textSecondary }]}>{history.length} épisode{history.length !== 1 ? 's' : ''}</Text><TouchableOpacity onPress={() => setManage(!manage)}><Text style={{ color: colors.text, fontWeight: '600' }}>{manage ? 'Terminer' : 'Gérer'}</Text></TouchableOpacity></View>
          <View style={styles.historyGrid}>{history.map(item => <View key={`${item.animeId}-${item.episodeId}`} style={{ width: historyWidth, marginBottom: 22 }}><TouchableOpacity onPress={() => navigation.navigate('VideoPlayer', { animeId: item.animeId, episodeId: item.episodeId, autoPlay: true })} accessibilityLabel={`Reprendre ${item.anime.title}`}>
            <View style={{ aspectRatio: 16 / 9, borderRadius: radii.card, overflow: 'hidden', backgroundColor: colors.surface }}><Image source={{ uri: item.episode?.thumbnail || item.anime.banner || item.anime.thumbnail }} style={StyleSheet.absoluteFill} /><View style={styles.playOverlay}><Ionicons name={item.progress >= 90 ? 'refresh-outline' : 'play'} size={30} color="white" /></View><View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={{ height: 3, backgroundColor: colors.primary, width: `${Math.min(100, Math.max(0, item.progress))}%` }} /></View></View>
            <Text style={[styles.meta, { color: colors.textSecondary, marginTop: 8 }]} numberOfLines={2}>{item.anime.title}</Text><Text style={[styles.historyTitle, { color: colors.text }]} numberOfLines={2}>{item.episode?.title || 'Reprendre l’épisode'}</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>{item.episode ? `E${item.episode.number} • ` : ''}{item.progress >= 90 ? 'Regardé' : 'En cours'}</Text>
          </TouchableOpacity>{manage && <TouchableOpacity onPress={async () => { try { await databaseService.removeWatchHistory(item.animeId, item.episodeId); await load(); } catch { setError('Impossible de retirer cet épisode de l’historique.'); } }} accessibilityLabel="Retirer cet épisode"><Text style={{ color: colors.danger, paddingTop: 10 }}>Retirer de l’historique</Text></TouchableOpacity>}</View>)}</View>{!history.length && empty('Votre historique est vide', 'Les épisodes regardés apparaîtront ici pour les reprendre facilement.')}
        </>}
      </FadeIn></LoadingSwap>
    </ScrollView>}
    <Modal visible={editor !== null} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setEditor(null)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface }]}><Text style={[styles.collectionName, { color: colors.text, marginBottom: 20 }]}>{editor === 'new' ? 'Créer une collection' : 'Modifier la collection'}</Text><TextInput accessibilityLabel="Nom de la collection" value={name} onChangeText={setName} placeholder="Nom de la collection" placeholderTextColor={colors.textSecondary} maxLength={80} autoFocus style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
      <View style={styles.modalActions}><TouchableOpacity onPress={() => setEditor(null)} style={styles.iconButton}><Text style={{ color: colors.text }}>Annuler</Text></TouchableOpacity><TouchableOpacity disabled={!name.trim() || saving} onPress={save} style={styles.iconButton}><Text style={{ color: colors.primary, fontWeight: '700', opacity: name.trim() && !saving ? 1 : 0.4 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text></TouchableOpacity></View>
      {editor && editor !== 'new' && <TouchableOpacity onPress={async () => { try { await databaseService.deleteList(editor.id); setEditor(null); setSelectedId(null); await load(); } catch { setError('Impossible de supprimer cette collection.'); } }} style={styles.deleteButton}><Text style={{ color: colors.danger }}>Supprimer cette collection</Text></TouchableOpacity>}
    </View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, header: { paddingHorizontal: 18, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 27, fontWeight: '700' }, iconButton: { padding: 10 }, tabs: { paddingHorizontal: 8 }, tab: { paddingHorizontal: 14, paddingTop: 17, paddingBottom: 18, borderBottomWidth: 3 }, tabText: { fontSize: 15, fontWeight: '700' }, content: { paddingHorizontal: 18, paddingBottom: 32, maxWidth: 1000, width: '100%', alignSelf: 'center' }, toolbar: { paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 68 }, toolbarTitle: { fontSize: 18, flexShrink: 1 }, back: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }, animeRow: { flexDirection: 'row', marginBottom: 16, gap: 18 }, posterButton: { width: 88 }, poster: { borderRadius: radii.card, width: 88, height: 132 }, rowInfo: { flex: 1, paddingVertical: 3 }, animeTitle: { fontSize: 17, lineHeight: 24 }, meta: { fontSize: 13, lineHeight: 20 }, rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 12 }, collection: { borderRadius: radii.panel, flexDirection: 'row', alignItems: 'center', padding: 18, marginBottom: 14 }, collectionName: { fontSize: 20, lineHeight: 28, marginBottom: 10 }, empty: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 65 }, emptyTitle: { fontSize: 20, fontWeight: '600', marginTop: 20, marginBottom: 10, textAlign: 'center' }, emptyText: { fontSize: 14, lineHeight: 22, textAlign: 'center' }, historyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, historyTitle: { fontSize: 16, lineHeight: 23, marginVertical: 5 }, playOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }, progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 }, modal: { borderRadius: radii.panel, width: '100%', maxWidth: 440, padding: 24 }, input: { borderRadius: radii.control, padding: 14, borderWidth: 1, fontSize: 16 }, modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }, deleteButton: { paddingTop: 20, marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#666' },
});
