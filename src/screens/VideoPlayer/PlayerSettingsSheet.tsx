import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Switch, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StreamingServer } from '../../types/anime';
import { palette } from '../../theme/palette';
import { radii } from '../../theme/shape';

const colors = palette.dark;
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const rateLabel = (rate: number) => rate === 1 ? 'Normale' : `${rate}×`;
type Page = 'main' | 'quality' | 'speed' | 'server';
export type QualityOption = { label: string; url: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  reduced: boolean;
  /** Réglages du lecteur natif (vitesse, qualité, enchaînement) : masqués quand un lecteur web (embed) est affiché. */
  nativePlayback: boolean;
  speed: number;
  onSpeed: (rate: number) => void;
  autoNext: boolean;
  onAutoNext: (value: boolean) => void;
  qualities: QualityOption[];
  currentQuality?: string;
  onQuality: (option: QualityOption) => void;
  /** Absent hors ligne : aucun serveur ne s'applique au fichier téléchargé. */
  servers?: StreamingServer[];
  currentServer: string;
  onServer: (server: StreamingServer) => void;
};

const serverLabel = (server: StreamingServer, index: number) => `${server.name || `Lecteur ${index + 1}`}${server.langue ? ` • ${server.langue.toUpperCase()}` : ''}`;

/** Panneau de réglages façon lecteur de streaming : rubriques avec la valeur courante, chacune ouvrant une liste à coche. */
export default function PlayerSettingsSheet(props: Props) {
  const { visible, onClose, reduced, nativePlayback, speed, onSpeed, autoNext, onAutoNext, qualities, currentQuality, onQuality, servers, currentServer, onServer } = props;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>('main');
  useEffect(() => { if (visible) setPage('main'); }, [visible]);
  const landscape = width > height;
  const qualityIndex = qualities.findIndex(option => option.url === currentQuality);
  const serverIndex = servers?.findIndex(server => server.url === currentServer) ?? -1;
  const back = () => page === 'main' ? onClose() : setPage('main');
  const titles: Record<Page, string> = { main: 'Paramètres', quality: 'Qualité', speed: 'Vitesse de lecture', server: 'Lecteur' };

  const entry = (icon: React.ComponentProps<typeof Ionicons>['name'], label: string, value: string, target: Page) => <TouchableOpacity key={target} accessibilityRole="button" accessibilityLabel={`${label} : ${value}`} onPress={() => setPage(target)} style={styles.row}>
    <Ionicons name={icon} size={22} color={colors.textSecondary} style={styles.rowIcon} />
    <Text style={styles.rowLabel}>{label}</Text>
    <Text numberOfLines={1} style={styles.rowValue}>{value}</Text>
    <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
  </TouchableOpacity>;
  const choice = (key: string, label: string, selected: boolean, action: () => void) => <TouchableOpacity key={key} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={action} style={styles.row}>
    <View style={styles.check}>{selected && <Ionicons name="checkmark" size={22} color={colors.primary} />}</View>
    <Text style={[styles.rowLabel, selected && { color: colors.primary, fontWeight: '600' }]}>{label}</Text>
  </TouchableOpacity>;

  let content: React.ReactNode;
  if (page === 'quality') content = qualities.map((option, index) => choice(`${option.url}-${index}`, option.label, index === qualityIndex, () => { onQuality(option); onClose(); }));
  else if (page === 'speed') content = PLAYBACK_RATES.map(rate => choice(String(rate), rateLabel(rate), speed === rate, () => { onSpeed(rate); setPage('main'); }));
  else if (page === 'server') content = servers?.length ? servers.map((server, index) => choice(`${server.url}-${index}`, serverLabel(server, index), index === serverIndex, () => { onServer(server); onClose(); })) : <Text style={styles.empty}>Aucun autre lecteur pour cet épisode.</Text>;
  else content = <>
    {nativePlayback && qualities.length > 1 && entry('options-outline', 'Qualité', qualities[qualityIndex]?.label ?? qualities[0].label, 'quality')}
    {nativePlayback && entry('speedometer-outline', 'Vitesse de lecture', rateLabel(speed), 'speed')}
    {servers && entry('server-outline', 'Lecteur', serverIndex >= 0 ? serverLabel(servers[serverIndex], serverIndex) : nativePlayback ? 'Lecteur intégré' : 'Aucun', 'server')}
    {nativePlayback && <View style={styles.row}>
      <Ionicons name="play-forward-outline" size={22} color={colors.textSecondary} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>Enchaîner les épisodes</Text>
      <Switch accessibilityLabel="Enchaîner les épisodes" value={autoNext} onValueChange={onAutoNext} trackColor={{ true: colors.buttonBg }} />
    </View>}
  </>;

  return <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={back} supportedOrientations={['portrait', 'landscape']}>
    <View style={[styles.backdrop, landscape && { alignItems: 'center' }]}>
      <TouchableOpacity style={StyleSheet.absoluteFill} accessibilityLabel="Fermer les paramètres" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom) }, landscape && { width: Math.min(560, width - insets.left - insets.right - 32) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          {page !== 'main' && <TouchableOpacity accessibilityLabel="Retour aux paramètres" onPress={() => setPage('main')} hitSlop={8} style={styles.headerButton}><Ionicons name="chevron-back" size={24} color="white" /></TouchableOpacity>}
          <Text style={[styles.title, page === 'main' && { marginLeft: 0 }]}>{titles[page]}</Text>
          <TouchableOpacity accessibilityLabel="Fermer" onPress={onClose} hitSlop={8} style={styles.headerButton}><Ionicons name="close" size={24} color="white" /></TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: height * (landscape ? 0.7 : 0.6) }}>{content}</ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { backgroundColor: colors.surface, paddingHorizontal: 20, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.surfaceElevated, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  headerButton: { padding: 8, marginHorizontal: -8 },
  title: { flex: 1, color: 'white', fontSize: 18, fontWeight: '700', marginHorizontal: 12 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 24 },
  rowLabel: { flex: 1, color: 'white', fontSize: 16 },
  rowValue: { color: colors.textSecondary, fontSize: 14, maxWidth: '45%' },
  check: { width: 24, alignItems: 'center' },
  empty: { color: colors.textSecondary, fontSize: 14, paddingVertical: 16 },
});
