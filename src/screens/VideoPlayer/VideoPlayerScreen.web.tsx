import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackScreenProps } from '../../types/navigation';
import { Episode } from '../../types/anime';
import apiService from '../../services/apiService';
import { FadeIn } from '../../components/Motion';
import { palette } from '../../theme/palette';

/** The browser uses the provider's embedded player; native keeps expo-video. */
export default function VideoPlayerScreen({ route, navigation }: RootStackScreenProps<'VideoPlayer'>) {
  const colors = palette.dark;
  const { episodeId, animeId } = route.params;
  const { width } = useWindowDimensions();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [serverIndex, setServerIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setServerIndex(0);
    Promise.all([apiService.getEpisodeById(episodeId), apiService.getAnimeEpisodes(animeId)])
      .then(([item, list]) => { if (active) { setEpisode(item); setEpisodes(list); } })
      .catch(() => { if (active) setError('Cet épisode ne peut pas être chargé pour le moment.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [episodeId, animeId, attempt]);
  const servers = episode?.streaming_servers?.filter(server => /^https?:\/\//i.test(server.url)) || [];
  const selected = servers[serverIndex];
  const current = episodes.findIndex(item => item.id === episodeId);
  const changeEpisode = (offset: number) => {
    const next = episodes[current + offset];
    if (next) navigation.replace('VideoPlayer', { episodeId: next.id, animeId, autoPlay: true });
  };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.page}>
    <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Revenir à l’anime" onPress={() => navigation.goBack()} style={styles.iconButton}><Ionicons name="arrow-back" color={colors.text} size={22} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={styles.eyebrow}>ANIMEVISION / LECTURE</Text><Text style={styles.title}>{episode?.animeTitle || 'Votre épisode'}</Text><Text style={styles.subtitle}>{Number(episode?.num_saison) > 0 && Number(episode?.num_saison) < 100 ? `Saison ${episode?.num_saison} · ` : episode?.titre_saison ? `${episode.titre_saison} · ` : ''}Épisode {episode?.number || ''} {episode?.langue?.toUpperCase()}</Text></View></View>
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View> : error ? <View style={styles.loading}><Text style={styles.subtitle}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={styles.button}><Text style={styles.buttonText}>Réessayer</Text></TouchableOpacity></View> : <FadeIn>
      {selected ? <View style={[styles.player, { height: Math.min(620, Math.max(220, (width - 48) * 9 / 16)) }]}><iframe {...{ credentialless: '' }} key={selected.url} src={selected.url} title={`${episode?.animeTitle || 'Anime'} — épisode ${episode?.number}`} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen style={{ border: 0, width: '100%', height: '100%', background: '#000' }} /></View> : <View style={styles.loading}><Ionicons name="videocam-off-outline" size={36} color={colors.textSecondary} /><Text style={styles.subtitle}>Aucun lecteur disponible pour cet épisode.</Text></View>}
      <View style={styles.controls}><TouchableOpacity accessibilityRole="button" disabled={current <= 0} onPress={() => changeEpisode(-1)} style={[styles.button, current <= 0 && { opacity: 0.35 }]}><Text style={styles.buttonText}>← Précédent</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={current < 0 || current >= episodes.length - 1} onPress={() => changeEpisode(1)} style={[styles.button, (current < 0 || current >= episodes.length - 1) && { opacity: 0.35 }]}><Text style={styles.buttonText}>Suivant →</Text></TouchableOpacity></View>
      {servers.length > 0 && <View style={styles.section}><Text style={styles.eyebrow}>CHOISIR UN LECTEUR</Text><View style={styles.serverList}>{servers.map((server, index) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: index === serverIndex }} key={`${server.url}-${index}`} onPress={() => setServerIndex(index)} style={[styles.server, index === serverIndex && { borderColor: colors.primary, backgroundColor: '#302347' }]}><Text style={styles.buttonText}>{server.name || `Lecteur ${index + 1}`}</Text></TouchableOpacity>)}</View><Text style={styles.subtitle}>Si un lecteur ne répond pas, essayez un autre serveur.</Text>{selected && <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(selected.url)} style={{ paddingVertical: 16 }}><Text style={{ color: colors.primary }}>Ouvrir ce lecteur dans un nouvel onglet ↗</Text></TouchableOpacity>}</View>}
    </FadeIn>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 24, width: '100%', maxWidth: 1400, alignSelf: 'center' }, header: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 24 },
  iconButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#242131', justifyContent: 'center', alignItems: 'center' },
  eyebrow: { color: '#B99AFF', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 8 }, title: { color: '#F5F2FF', fontSize: 26, fontWeight: '800', marginBottom: 6 }, subtitle: { color: '#ADA6BF', fontSize: 14, lineHeight: 22 },
  loading: { minHeight: 300, gap: 20, alignItems: 'center', justifyContent: 'center' }, player: { overflow: 'hidden', borderRadius: 20, backgroundColor: '#000' },
  controls: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginVertical: 20 }, button: { backgroundColor: '#7354D2', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14 }, buttonText: { color: '#F5F2FF', fontWeight: '600' },
  section: { borderRadius: 20, padding: 24, backgroundColor: '#1B1A27', borderWidth: 1, borderColor: '#302C41' }, serverList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 12 }, server: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#494254' },
});
