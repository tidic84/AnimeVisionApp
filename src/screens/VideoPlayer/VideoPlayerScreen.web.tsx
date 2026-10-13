import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackScreenProps } from '../../types/navigation';
import { Anime, Episode } from '../../types/anime';
import apiService from '../../services/apiService';
import { palette } from '../../theme/palette';
import useReducedMotion from '../../hooks/useReducedMotion';
import PlayerDetails from './PlayerDetails';

const colors = palette.dark;
export default function VideoPlayerScreen({ route, navigation }: RootStackScreenProps<'VideoPlayer'>) {
  const { episodeId, animeId } = route.params;
  const reduced = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [anime, setAnime] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [serverIndex, setServerIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setServerIndex(0); setEpisode(null);
    setEpisodes([]); setAnime(null);
    void apiService.getAnimeById(animeId).then(item => { if (active) setAnime(item); }).catch(() => {});
    apiService.getEpisodeById(episodeId)
      .then(item => {
        if (!active) return;
        setEpisode(item);
        if (item.saison_id) void apiService.getSeasonEpisodes(item.saison_id, animeId).then(list => {
          if (active) setEpisodes(list.filter(candidate => !item.langue || !candidate.langue || candidate.langue === item.langue));
        }).catch(() => { if (active) setEpisodes([item]); });
        else setEpisodes([item]);
      })
      .catch(() => { if (active) setError('Cet épisode ne peut pas être chargé pour le moment.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [episodeId, animeId, attempt]);
  useEffect(() => { const update = () => setFullscreen(document.fullscreenElement === frame.current); document.addEventListener('fullscreenchange', update); return () => document.removeEventListener('fullscreenchange', update); }, []);
  const servers = episode?.streaming_servers?.filter(server => /^https?:\/\//i.test(server.url)) || [];
  const selected = servers[serverIndex];
  const current = episodes.findIndex(item => item.id === episodeId);
  const navigateEpisode = (item: Episode) => navigation.replace('VideoPlayer', { episodeId: item.id, animeId, autoPlay: true });
  const openSettings = async () => { if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} } setSheet(true); };
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.current?.requestFullscreen(); } catch { setError('Le plein écran n’est pas disponible dans ce navigateur.'); } };
  return <ScrollView style={styles.root} contentContainerStyle={styles.page}>
    <div ref={frame} style={{ width: '100%', background: '#000' }}>
      <View style={styles.playerHeader}><TouchableOpacity accessibilityLabel="Retour" onPress={() => navigation.goBack()} style={styles.icon}><Ionicons name="chevron-back" size={25} color="white" /></TouchableOpacity><Text style={styles.playerTitle} numberOfLines={1}>{episode?.animeTitle || anime?.title || 'Lecture'}</Text>{current >= 0 && current < episodes.length - 1 && <TouchableOpacity accessibilityLabel="Épisode suivant" onPress={() => navigateEpisode(episodes[current + 1])} style={styles.icon}><Ionicons name="play-skip-forward-outline" size={23} color="white" /></TouchableOpacity>}<TouchableOpacity accessibilityLabel="Choisir le serveur" onPress={() => void openSettings()} style={styles.icon}><Ionicons name="settings-outline" size={24} color="white" /></TouchableOpacity><TouchableOpacity accessibilityLabel={fullscreen ? 'Quitter le plein écran' : 'Plein écran'} onPress={toggleFullscreen} style={styles.icon}><Ionicons name={fullscreen ? 'contract-outline' : 'expand-outline'} size={24} color="white" /></TouchableOpacity></View>
      <View style={[styles.player, fullscreen && { aspectRatio: undefined, height: 'calc(100vh - 56px)' as any }]}>
        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : selected ? <iframe {...{ credentialless: '' }} key={selected.url} src={selected.url} title={`${episode?.animeTitle || 'Anime'} — épisode ${episode?.number}`} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen style={{ border: 0, width: '100%', height: '100%', background: '#000' }} /> : <View style={styles.empty}><Ionicons name="videocam-off-outline" size={35} color={colors.textSecondary} /><Text style={styles.message}>{error || 'Aucun lecteur disponible pour cet épisode.'}</Text><TouchableOpacity onPress={() => setAttempt(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>Réessayer</Text></TouchableOpacity></View>}
      </View>
    </div>
    {!!error && !!selected && <Text style={[styles.message, { paddingHorizontal: 20 }]}>{error}</Text>}
    {episode && <PlayerDetails anime={anime} episode={episode} episodes={episodes} onEpisode={navigateEpisode} onAnime={() => navigation.navigate('AnimeDetail', { animeId })} />}
    <Modal visible={sheet} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={() => setSheet(false)}><View style={styles.backdrop}><TouchableOpacity style={{ flex: 1 }} accessibilityLabel="Fermer les serveurs" onPress={() => setSheet(false)} /><View style={styles.sheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Lecteurs disponibles</Text><TouchableOpacity accessibilityLabel="Fermer" onPress={() => setSheet(false)} style={styles.icon}><Ionicons name="close" size={24} color="white" /></TouchableOpacity></View><Text style={styles.message}>La lecture et ses commandes sont fournies par le serveur sélectionné.</Text>{servers.map((server, index) => <TouchableOpacity key={`${server.url}-${index}`} accessibilityState={{ selected: serverIndex === index }} onPress={() => { setServerIndex(index); setSheet(false); }} style={styles.server}><Text style={[styles.serverText, serverIndex === index && { color: colors.primary }]}>{server.name || `Lecteur ${index + 1}`}{server.langue ? ` • ${server.langue}` : ''}</Text>{serverIndex === index && <Ionicons name="checkmark" size={22} color={colors.primary} />}</TouchableOpacity>)}{!servers.length && <Text style={styles.message}>Aucun serveur disponible.</Text>}{selected && <TouchableOpacity onPress={() => Linking.openURL(selected.url)} style={styles.server}><Text style={{ color: colors.primary }}>Ouvrir le lecteur dans un nouvel onglet ↗</Text></TouchableOpacity>}</View></View></Modal>
  </ScrollView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background }, page: { width: '100%', maxWidth: 1200, alignSelf: 'center' }, playerHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 6 }, playerTitle: { color: 'white', fontSize: 14, flex: 1, marginHorizontal: 6 }, icon: { padding: 10 }, player: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, empty: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 }, message: { color: colors.textSecondary, fontSize: 13, lineHeight: 22 }, retry: { paddingVertical: 10, paddingHorizontal: 18, backgroundColor: colors.buttonBg, borderRadius: 5 }, retryText: { color: 'white', fontWeight: '600' }, backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }, sheet: { padding: 20, backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxWidth: 700, width: '100%', alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { fontSize: 20, fontWeight: '700', color: 'white' }, server: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, serverText: { color: 'white', fontSize: 15 } });
