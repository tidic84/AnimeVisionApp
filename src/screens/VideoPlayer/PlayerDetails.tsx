import { radii } from '../../theme/shape';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Anime, Episode } from '../../types/anime';
import { palette } from '../../theme/palette';

const colors = palette.dark;
export default function PlayerDetails({ anime, episode, episodes, onEpisode, onAnime }: { anime: Anime | null; episode: Episode; episodes: Episode[]; onEpisode: (item: Episode) => void; onAnime: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const current = episodes.findIndex(item => item.id === episode.id);
  const next = current >= 0 ? episodes.slice(current + 1, current + 6) : [];
  const description = episode.description || anime?.synopsis;
  const renderEpisode = (item: Episode, horizontal = false) => <TouchableOpacity key={item.id} onPress={() => onEpisode(item)} accessibilityLabel={`Lire l’épisode ${item.number}, ${item.title}`} style={[styles.episode, horizontal && { width: 230, marginRight: 14, flexDirection: 'column', alignItems: 'stretch' }]}>
    <View style={[styles.thumbnail, horizontal && { width: '100%' }]}>{(item.thumbnail || anime?.banner || anime?.thumbnail) ? <Image source={{ uri: item.thumbnail || anime?.banner || anime?.thumbnail }} style={StyleSheet.absoluteFill} /> : null}<View style={styles.play}><Ionicons name={item.id === episode.id ? 'volume-medium' : 'play'} color="white" size={22} /></View></View>
    <View style={{ flex: 1 }}><Text style={[styles.episodeName, item.id === episode.id && { color: colors.primary }]} numberOfLines={2}>E{item.number} • {item.title || `Épisode ${item.number}`}</Text><Text style={styles.meta}>{item.titre_saison || (item.num_saison ? `Saison ${item.num_saison}` : '')}{item.langue ? ` • ${item.langue.toUpperCase()}` : ''}</Text></View>
  </TouchableOpacity>;
  return <View style={styles.details}>
    <TouchableOpacity onPress={onAnime}><Text style={styles.anime}>{anime?.title || episode.animeTitle || 'Voir la série'} <Ionicons name="chevron-forward" color={colors.primary} size={16} /></Text></TouchableOpacity>
    <Text style={styles.title}>{episode.num_saison && Number(episode.num_saison) < 100 ? `S${episode.num_saison} ` : ''}E{episode.number} • {episode.title || 'Épisode'}</Text>
    <Text style={styles.meta}>{episode.titre_saison || ''}{episode.langue ? ` • ${episode.langue.toUpperCase()}` : ''}{episode.duration > 0 ? ` • ${Math.round(episode.duration / 60)} min` : ''}</Text>
    {!!description && <TouchableOpacity accessibilityLabel={expanded ? 'Réduire la description' : 'Lire la description'} onPress={() => setExpanded(!expanded)}><Text style={styles.description} numberOfLines={expanded ? undefined : 3}>{description}</Text><Text style={styles.expand}>{expanded ? 'Voir moins' : 'Voir plus'}</Text></TouchableOpacity>}
    {!!next.length && <><Text style={styles.section}>À suivre</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginRight: -20 }}>{next.map(item => renderEpisode(item, true))}</ScrollView></>}
    <Text style={styles.section}>Épisodes de la saison <Text style={styles.meta}>({episodes.length})</Text></Text>
    {episodes.slice(0, visibleCount).map(item => renderEpisode(item))}
    {episodes.length > visibleCount && <TouchableOpacity onPress={() => setVisibleCount(count => count + 24)} style={{ paddingVertical: 18 }}><Text style={styles.expand}>Afficher les épisodes suivants</Text></TouchableOpacity>}
  </View>;
}
const styles = StyleSheet.create({ details: { padding: 20, maxWidth: 1000, width: '100%', alignSelf: 'center', paddingBottom: 42 }, anime: { color: colors.primary, fontSize: 17, fontWeight: '600', marginBottom: 12 }, title: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 29 }, meta: { color: colors.textSecondary, fontSize: 12, lineHeight: 20, marginTop: 5 }, description: { color: colors.textSecondary, fontSize: 14, lineHeight: 23, marginTop: 20 }, expand: { color: colors.primary, fontSize: 13, fontWeight: '600', marginTop: 6 }, section: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 30, marginBottom: 18 }, episode: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }, thumbnail: { borderRadius: radii.card, width: 130, aspectRatio: 16 / 9, backgroundColor: colors.surface, overflow: 'hidden' }, play: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' }, episodeName: { color: colors.text, fontSize: 14, lineHeight: 21 } });
