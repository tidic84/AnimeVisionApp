import AsyncStorage from '@react-native-async-storage/async-storage';
import { getScanMangaAddress, saveScanMangaAddress, getScanMangaStatus, getScanMangaUpdates, ScanMangaStatus, ScanMangaUpdate } from '../../services/comics/scanmanga';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, LayoutChangeEvent, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { MainTabScreenProps } from '../../types/navigation';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';
import { radii } from '../../theme/shape';
import { MotionPressable } from '../../components/Motion';
import SectionHeader from '../../components/SectionHeader';
import { gutterFor, typography } from '../../theme/tokens';
import AuthImage from '../../components/AuthImage';
import CustomModal from '../../components/CustomModal';
import UndoBar from '../../components/UndoBar';
import { dialog } from '../../components/Dialog';
import PdfRenderHost from '../../components/PdfRenderHost';
import { hitSlopFor } from '../../utils/accessibility';
import databaseService, { ComicProgress } from '../../services/databaseService';
import { getComicLanguage, saveComicLanguage } from '../../services/preferences';
import { Comic, ComicKind, ComicLanguage, ComicOrder, ComicStatus, ComicTag, allProviders, getProvider, onlineProvider } from '../../services/comics';
import { importLocalComic } from '../../services/comics/localLibrary';
import { OpdsServer, listServers, removeServer, saveServer } from '../../services/comics/opds';
import { groupDuplicates } from '../../services/comics/duplicates';
import { PREFERRED_LANGUAGES, languageName } from '../../services/comics/languages';

type Section = ComicKind | 'all' | 'local';
const PAGE = 24;
const SECTIONS: { key: Section; label: string }[] = [{ key: 'all', label: 'Tous' }, { key: 'manga', label: 'Mangas' }, { key: 'manhwa', label: 'Manhwas' }, { key: 'manhua', label: 'Manhuas' }, { key: 'local', label: 'Ma bibliothèque' }];
const ORDERS: { key: ComicOrder; label: string }[] = [{ key: 'popular', label: 'Populaires' }, { key: 'latest', label: 'Mis à jour' }, { key: 'rating', label: 'Les mieux notés' }, { key: 'title', label: 'Alphabétique' }, { key: 'added', label: 'Catalogue complet' }];
// MangaDex refuse de parcourir au-delà de 10 000 résultats par tri (sauf « Catalogue complet », parcouru par curseur).
const WINDOW = 10000;
export const STATUS_LABELS: Record<ComicStatus, string> = { ongoing: 'En cours', completed: 'Terminé', hiatus: 'En pause', cancelled: 'Abandonné', unknown: 'Statut inconnu' };
const ICON_SLOP = hitSlopFor(42);

export default function ComicCatalogScreen({ navigation, route }: MainTabScreenProps<'Scans'>) {
  const colors = palette[useAppColorScheme() ?? 'dark'];
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  // Largeur réelle de l'écran (sans la barre latérale du grand écran).
  const [measured, setMeasured] = useState(0);
  const width = measured || windowWidth;
  const columns = width > 1300 ? 7 : width > 1100 ? 6 : width > 760 ? 4 : width > 540 ? 3 : 2;
  const gutter = gutterFor(width);
  const cardWidth = (width - 2 * gutter - (columns - 1) * 14) / columns;
  const [section, setSection] = useState<Section>(route.params?.section ?? 'all');
  const [language, setLanguage] = useState<ComicLanguage>('fr');
  const [query, setQuery] = useState('');
  const [onlineSource, setOnlineSource] = useState('mangadex');
  const [sourceStatus, setSourceStatus] = useState<ScanMangaStatus | null>(null);
  const [releases, setReleases] = useState<ScanMangaUpdate[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sourceForm, setSourceForm] = useState<{ address: string; saving: boolean; error: string } | null>(null);
  const [order, setOrder] = useState<ComicOrder>('popular');
  const [status, setStatus] = useState<ComicStatus | undefined>();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tags, setTags] = useState<ComicTag[]>([]);
  const [items, setItems] = useState<Comic[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | undefined>();
  // Nombre d'œuvres par type annoncé par MangaDex (une fiche par œuvre, traductions comprises).
  const [counts, setCounts] = useState<Record<ComicKind, number> | null>(null);
  // Ma bibliothèque : fichiers importés ou un serveur OPDS.
  const [servers, setServers] = useState<OpdsServer[]>([]);
  const [library, setLibrary] = useState('local');
  const [serverForm, setServerForm] = useState<{ name: string; url: string; username: string; password: string; error: string; saving: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(false);
  const [favorites, setFavorites] = useState<Comic[]>([]);
  const [history, setHistory] = useState<ComicProgress[]>([]);
  const [importing, setImporting] = useState('');
  const [refresh, setRefresh] = useState(0);
  // « En cours » : sélection multiple et dernier retrait annulable.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ message: string; ids: string[] } | null>(null);
  const request = useRef(0);
  const local = section === 'local';
  const provider = local ? getProvider(library) : getProvider(onlineSource);
  // Panneau de synchro, « Œuvres indexées » et nouveautés : propres au serveur de catalogue Scan-Manga.
  const scanMangaUi = !local && (onlineSource === 'scanmanga' || onlineSource === 'online');
  useEffect(() => { void AsyncStorage.getItem('comicOnlineSource').then(value => { if (['mangadex','scanmanga','poseidon','online'].includes(value || '')) setOnlineSource(value!); }).catch(() => {}); }, []);
  const selectSource = (id: string) => { setOnlineSource(id); setTagIds([]); setTags([]); setQuery(''); setWarnings([]); setOrder(id === 'scanmanga' ? 'latest' : 'popular'); void AsyncStorage.setItem('comicOnlineSource',id).catch(() => {}); };
  useEffect(() => {
    let active=true, previous: ScanMangaStatus | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    setSourceStatus(null); setReleases([]);
    if (scanMangaUi) {
      const poll = async () => {
        try {
          const [value, updates] = await Promise.all([getScanMangaStatus(),getScanMangaUpdates()]);
          if (!active) return;
          setSourceStatus(value); setReleases(updates);
          if (previous && ((previous.comics === 0 && value.comics > 0) || (previous.running && !value.running))) setRefresh(count=>count+1);
          previous=value;
        } catch {}
      };
      void poll(); timer=setInterval(()=>void poll(),15000);
    }
    return ()=>{active=false;clearInterval(timer);};
  }, [onlineSource, local, refresh]);
  const configureSource = async () => setSourceForm({ address:await getScanMangaAddress(),saving:false,error:'' });
  const saveSource = async () => {
    if(!sourceForm || sourceForm.saving)return;
    setSourceForm({...sourceForm,saving:true,error:''});
    try { await saveScanMangaAddress(sourceForm.address); setSourceForm(null); setRefresh(value=>value+1); }
    catch(error:any) { setSourceForm(form=>form && {...form,saving:false,error:error.message}); }
  };

  useEffect(() => { if (route.params?.section) setSection(route.params.section); }, [route.params?.section]);
  useEffect(() => { void getComicLanguage().then(setLanguage); }, []);
  // Fichiers importés : couverture relue (sur Windows, l'adresse blob enregistrée ne vaut que pour la session).
  const fresh = (comic: Comic) => comic.provider === 'local' ? getProvider('local').getComic(comic.id).catch(() => comic) : Promise.resolve(comic);
  const loadHistory = () => databaseService.getComicHistory()
    .then(rows => Promise.all(rows.map(async row => ({ ...row, comic: await fresh(row.comic) })))).then(setHistory).catch(() => {});
  useFocusEffect(useCallback(() => {
    void listServers().then(setServers).catch(() => {});
    void databaseService.getComicFavorites().then(list => Promise.all(list.map(fresh))).then(setFavorites).catch(() => {});
    void loadHistory();
    setRefresh(value => value + 1);
  }, []));
  useEffect(() => { let active=true; if (sheet) provider.listTags().then(value=>{if(active)setTags(value);}).catch(() => {}); return ()=>{active=false;}; }, [sheet, provider, onlineSource]);

  useEffect(() => {
    if (local || onlineSource !== 'mangadex') return;
    let active = true;
    setCounts(null);
    const count = (kind: ComicKind) => onlineProvider.search({ kind, language, order: 'popular', offset: 0, limit: 1 }).then(result => result.total);
    Promise.all([count('manga'), count('manhwa'), count('manhua')]).then(([manga, manhwa, manhua]) => { if (active) setCounts({ manga, manhwa, manhua }); }).catch(() => {});
    return () => { active = false; };
  }, [language, local, onlineSource]);

  const load = async (offset: number, cursor?: string) => {
    const token = ++request.current;
    setLoading(true); setError(''); setWarnings([]);
    try {
      const search = { kind: local ? 'all' as const : section, query, tagIds, status, language, order, offset, limit: PAGE, cursor };
      const result = await provider.search(search);
      if (token !== request.current) return;
      const fresh = result.items;
      setItems(previous => offset === 0 && !cursor ? fresh : [...previous, ...fresh.filter(item => !previous.some(old => old.provider === item.provider && old.id === item.id))]);
      setTotal(result.total); setWarnings(result.warnings || []);
      setNext(result.next);
      // Recherche : aussi dans la bibliothèque (fichiers, serveurs OPDS), ajoutée quand elle arrive pour ne pas retarder
      // les résultats en ligne (un serveur OPDS injoignable met jusqu'à 15 s à échouer). Doublons regroupés à l'affichage.
      if (!local && query.trim() && offset === 0 && !cursor) void allProviders()
        .then(sources => Promise.all(sources.filter(source => source.id === 'local' || source.id.startsWith('opds:')).map(source => source.search({ ...search, kind: 'all' }).then(found => found.items).catch(() => []))))
        .then(found => {
          const extra = found.flat().filter(item => section === 'all' || item.kind === section);
          if (token === request.current && extra.length) setItems(previous => [...previous, ...extra.filter(item => !previous.some(old => old.provider === item.provider && old.id === item.id))]);
        }).catch(() => {});
    } catch (failure: any) {
      if (token === request.current) setError(failure?.message || 'Le catalogue ne peut pas être chargé.');
    } finally { if (token === request.current) setLoading(false); }
  };
  useEffect(() => {
    setItems([]); setNext(undefined);
    const timer = setTimeout(() => { void load(0); }, query.trim() ? 400 : 0);
    return () => { clearTimeout(timer); request.current += 1; };
  }, [section, query, order, status, tagIds, language, library, onlineSource, refresh]);

  const importFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-cbz', 'application/vnd.comicbook+zip', 'application/pdf', 'application/octet-stream', '.cbz', '.zip', '.pdf'], copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setImporting(`Import de ${asset.name}…`); setError('');
    try {
      const item = await importLocalComic(asset, (done, count) => setImporting(`Import de ${asset.name} : page ${done}/${count}`));
      setRefresh(value => value + 1);
      navigation.navigate('ComicDetail', { provider: 'local', comicId: item.id });
    } catch (failure: any) {
      setError(failure?.message || 'Import impossible.');
    } finally { setImporting(''); }
  };

  const addServer = async () => {
    if (!serverForm) return;
    setServerForm({ ...serverForm, saving: true, error: '' });
    try {
      const server = await saveServer({ name: serverForm.name.trim() || 'Mon serveur', url: serverForm.url, username: serverForm.username.trim() || undefined, password: serverForm.password || undefined });
      setServers(await listServers()); setServerForm(null); setLibrary(`opds:${server.id}`);
    } catch (failure: any) { setServerForm(form => form && { ...form, saving: false, error: failure?.message || 'Connexion impossible.' }); }
  };
  const forgetServer = async (server: OpdsServer) => {
    const confirmed = await dialog.confirm({ title: `Retirer « ${server.name} » ?`, message: 'Le serveur et ses identifiants sont retirés de l’app. Rien n’est supprimé sur le serveur ; la progression déjà enregistrée reste dans l’app.', buttons: [{ text: 'Annuler', style: 'cancel', value: false }, { text: 'Retirer', style: 'destructive', value: true }] });
    if (!confirmed) return;
    await removeServer(server.id); setServers(await listServers()); setLibrary('local');
  };

  const chooseLanguage = async () => {
    const value = await dialog.actions({ title: 'Langue préférée des chapitres', subtitle: 'Le catalogue montre les titres traduits dans cette langue. Chaque titre peut ensuite être lu dans une autre langue disponible.', actions: PREFERRED_LANGUAGES.map(code => ({ label: `${languageName(code)}${code === language ? '  ✓' : ''}`, value: code })) });
    if (value) { setLanguage(value); void saveComicLanguage(value); }
  };

  // --- « En cours » : retirer (annulable), sélection multiple, réinitialiser ---
  const hide = async (entries: ComicProgress[]) => {
    const ids = entries.map(entry => entry.comicId);
    if (!ids.length) return;
    setHistory(previous => previous.filter(entry => !ids.includes(entry.comicId)));
    setSelecting(false); setSelected([]);
    try {
      await databaseService.setComicsHidden(ids, true);
      setUndo({ message: ids.length > 1 ? `${ids.length} titres retirés de « En cours »` : `« ${entries[0].comic.title} » retiré de « En cours »`, ids });
    } catch { void loadHistory(); setError('Le retrait a échoué.'); }
  };
  const restore = async (ids: string[]) => { await databaseService.setComicsHidden(ids, false).catch(() => {}); void loadHistory(); };
  const reset = async (entry: ComicProgress) => {
    const confirmed = await dialog.confirm({ title: 'Réinitialiser la progression ?', message: `Les positions de lecture (toutes langues) et les chapitres lus de « ${entry.comic.title} » seront effacés. Cette action ne peut pas être annulée. Les favoris et les fichiers importés sont conservés.`, buttons: [{ text: 'Annuler', style: 'cancel', value: false }, { text: 'Réinitialiser', style: 'destructive', value: true }] });
    if (!confirmed) return;
    await databaseService.resetComicProgress(entry.comicId).catch(() => setError('La réinitialisation a échoué.'));
    void loadHistory();
  };
  const entryMenu = async (entry: ComicProgress) => {
    const action = await dialog.actions({ title: entry.comic.title, subtitle: 'Retirer de « En cours » garde la progression, les favoris et les fichiers importés.', actions: [
      { label: 'Ouvrir la fiche', value: 'detail', icon: 'information-circle-outline' },
      { label: 'Retirer de « En cours »', value: 'hide', icon: 'eye-off-outline' },
      { label: 'Sélectionner plusieurs titres', value: 'select', icon: 'checkbox-outline' },
      { label: 'Réinitialiser la progression…', value: 'reset', icon: 'refresh-outline', style: 'destructive' },
    ] });
    if (action === 'detail') open(entry.comic);
    else if (action === 'hide') void hide([entry]);
    else if (action === 'select') { setSelecting(true); setSelected([entry.comicId]); }
    else if (action === 'reset') void reset(entry);
  };
  const toggleSelected = (comicId: string) => setSelected(previous => previous.includes(comicId) ? previous.filter(id => id !== comicId) : [...previous, comicId]);
  const activeCount = tagIds.length + Number(!!status);
  const searchLabel = local ? (library === 'local' ? 'Rechercher dans mes fichiers' : `Rechercher sur ${getProvider(library).name}`) : section === 'all' ? 'Rechercher un manga, manhwa ou manhua' : `Rechercher un ${section}`;
  const browsing = !query.trim() && !activeCount;
  // Étagères du type affiché : les fichiers importés ont leurs propres entrées.
  const mine = (comic: Comic) => section === 'all' || (local ? comic.provider === 'local' || comic.provider.startsWith('opds:') : comic.provider !== 'local' && comic.kind === section);
  const groups = useMemo(() => groupDuplicates(items), [items]);
  const sourceName = (comic: Comic) => getProvider(comic.provider).name;
  const canMore = !!next || (!local && onlineSource === 'mangadex' && items.length < Math.min(total, WINDOW));
  const server = servers.find(item => `opds:${item.id}` === library);
  const chip = (label: string, active: boolean, onPress: () => void, key = label) => <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, { backgroundColor: active ? colors.accentSoft : colors.surface, borderColor: active ? colors.primary : colors.border }]}><Text style={{ color: active ? colors.primary : colors.text, fontSize: 13, fontWeight: active ? '700' : '500' }}>{label}</Text></TouchableOpacity>;
  const cover = (uri: string | undefined, w: number) => uri ? <AuthImage uri={uri} style={{ width: w, height: w * 1.45, borderRadius: radii.card, backgroundColor: colors.surface }} resizeMode="cover" /> : <View style={[styles.placeholder, { width: w, height: w * 1.45, backgroundColor: colors.surface }]}><Ionicons name="book-outline" size={32} color={colors.textSecondary} /></View>;
  const open = (comic: Comic) => navigation.navigate('ComicDetail', { provider: comic.provider, comicId: comic.id });

  type ShelfEntry = { key: string; comic: Comic; subtitle?: string; onPress: () => void; onMenu?: () => void; checked?: boolean };
  const shelf = (title: string, data: ShelfEntry[], actions?: React.ReactNode) => data.length > 0 && <View style={{ marginBottom: 28 }}>
    <SectionHeader title={title} action={actions} gutter={gutter} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: gutter, paddingVertical: 4 }}>{data.map(entry => <View key={entry.key} style={{ width: 128 }}>
      <MotionPressable hoverScale={1.04} accessibilityRole={entry.checked === undefined ? 'button' : 'checkbox'} accessibilityState={entry.checked === undefined ? undefined : { checked: entry.checked }} accessibilityLabel={[entry.comic.title, entry.subtitle].filter(Boolean).join(', ')} accessibilityHint={entry.onMenu && entry.checked === undefined ? 'Appui long pour plus d’options' : undefined} onPress={entry.onPress} onLongPress={entry.onMenu} delayLongPress={400}>
        <View style={entry.checked && { opacity: 0.75 }}>{cover(entry.comic.coverThumb, 128)}</View>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.text }]}>{entry.comic.title}</Text>{!!entry.subtitle && <Text numberOfLines={1} style={[styles.meta, { color: colors.primary }]}>{entry.subtitle}</Text>}
      </MotionPressable>
      {entry.checked !== undefined ? <View pointerEvents="none" style={[styles.badge, { backgroundColor: entry.checked ? colors.primary : 'rgba(0,0,0,0.55)' }]}><Ionicons name={entry.checked ? 'checkmark' : 'ellipse-outline'} size={18} color="#fff" /></View>
        : entry.onMenu && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Options pour ${entry.comic.title}`} onPress={entry.onMenu} hitSlop={hitSlopFor(32)} style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}><Ionicons name="ellipsis-horizontal" size={18} color="#fff" /></TouchableOpacity>}
    </View>)}</ScrollView>
  </View>;
  const reading = history.filter(entry => mine(entry.comic));
  const textButton = (label: string, onPress: () => void, color = colors.primary, disabled = false) => <TouchableOpacity key={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ paddingHorizontal: 8, paddingVertical: 6, opacity: disabled ? 0.4 : 1 }}><Text style={{ color, fontWeight: '600' }}>{label}</Text></TouchableOpacity>;
  const readingActions = selecting
    ? <View style={{ flexDirection: 'row' }}>{textButton(`Retirer (${selected.length})`, () => void hide(reading.filter(entry => selected.includes(entry.comicId))), colors.danger, !selected.length)}{textButton('Terminé', () => { setSelecting(false); setSelected([]); }, colors.text)}</View>
    : textButton('Sélectionner', () => { setSelecting(true); setSelected([]); });

  const header = <View>
    {/* Synchronisation Scan-Manga : une ligne discrète (pastille d'état), le détail seulement en cas de problème. */}
    {scanMangaUi && <View style={[styles.syncRow, { marginHorizontal: gutter, backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.syncDot, { backgroundColor: !sourceStatus ? colors.textTertiary : sourceStatus.error ? colors.danger : sourceStatus.running ? colors.primary : sourceStatus.stale ? colors.warning : colors.success }]} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>Scan-Manga{sourceStatus ? ' · ' + sourceStatus.comics.toLocaleString('fr-FR') + (sourceStatus.comics === 1 ? ' œuvre indexée' : ' œuvres indexées') : ''}</Text>
        <Text style={{ color: sourceStatus?.error || sourceStatus?.stale ? colors.warning : colors.textSecondary, fontSize: 12 }}>
          {!sourceStatus ? 'Connexion au catalogue…' : sourceStatus.running ? 'Synchronisation en cours… les nouvelles œuvres apparaîtront automatiquement.' : sourceStatus.error ? sourceStatus.error : sourceStatus.lastSuccess ? `À jour au ${new Date(sourceStatus.lastSuccess).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}${sourceStatus.stale ? ' · données peut-être anciennes' : ''}` : 'Première synchronisation en attente.'}
        </Text>
        {sourceStatus && <Text style={{ color: colors.textTertiary, fontSize: 11 }} numberOfLines={2}>Indexé depuis les nouveautés et le classement : pas le catalogue complet de Scan-Manga.</Text>}
      </View>
      {textButton('Configurer',()=>void configureSource())}{textButton('Actualiser',()=>setRefresh(value=>value+1))}
    </View>}
    {warnings.map(message=><Text key={message} style={{color:colors.warning,paddingHorizontal:gutter,paddingBottom:8}}>{message}</Text>)}
    {scanMangaUi && browsing && shelf('Nouveaux chapitres · Scan-Manga',releases.filter(release=>section==='all'||release.comic.kind===section).map(release=>({key:release.chapter.id,comic:release.comic,subtitle:release.chapter.title,onPress:()=>open(release.comic)})))}
    {browsing && shelf('En cours', reading.map(entry => ({ key: `p-${entry.comicId}`, comic: entry.comic,
      subtitle: `${entry.language && entry.provider !== 'local' ? `${entry.language.toUpperCase()} · ` : ''}${entry.chapterNumber ? `Ch. ${entry.chapterNumber} · ` : ''}p. ${entry.page + 1}/${entry.pageCount || '?'}`,
      checked: selecting ? selected.includes(entry.comicId) : undefined,
      onPress: () => selecting ? toggleSelected(entry.comicId) : navigation.navigate('ComicReader', { provider: entry.provider, comicId: entry.comicId, chapterId: entry.chapterId, language: entry.language, page: entry.page, offset: entry.offset }),
      onMenu: () => selecting ? toggleSelected(entry.comicId) : void entryMenu(entry) })), readingActions)}
    {browsing && shelf('Mes favoris', favorites.filter(mine).map(comic => ({ key: `f-${comic.id}`, comic, onPress: () => open(comic) })))}
    {local && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[styles.chips, { paddingHorizontal: gutter }]}>
      {chip('Fichiers importés', library === 'local', () => setLibrary('local'))}
      {servers.map(item => chip(item.name, library === `opds:${item.id}`, () => setLibrary(`opds:${item.id}`), item.id))}
      {chip('+ Serveur OPDS', false, () => setServerForm({ name: '', url: '', username: '', password: '', error: '', saving: false }))}
    </ScrollView>}
    {local && server && <View style={[styles.importBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{server.name}</Text>
      <Text style={{ color: colors.textSecondary }} numberOfLines={1}>{server.url}{server.username ? ` · ${server.username}` : ''}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => void forgetServer(server)}><Text style={{ color: colors.danger }}>Retirer ce serveur</Text></TouchableOpacity>
    </View>}
    {local && library === 'local' && <View style={[styles.importBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Importer un fichier</Text>
      <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>CBZ, ZIP contenant des images ou PDF. Les pages sont copiées dans l’app et restent lisibles hors connexion.</Text>
      {importing ? <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.text }}>{importing}</Text></View>
        : <TouchableOpacity accessibilityRole="button" onPress={importFile} style={[styles.importButton, { backgroundColor: colors.buttonBg }]}><Ionicons name="folder-open-outline" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700' }}>Choisir un fichier</Text></TouchableOpacity>}
    </View>}
    <View style={[styles.toolbar, { paddingHorizontal: gutter }]}>
      <Text accessibilityRole="header" style={[typography.section, { color: colors.text, flex: 1 }]}>{local ? (server ? server.name : 'Fichiers importés') : query.trim() ? 'Résultats' : (order === 'added' && scanMangaUi ? 'Œuvres indexées' : ORDERS.find(option => option.key === order)?.label)}</Text>
      {!loading && Number.isFinite(total) && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{total.toLocaleString('fr-FR')} titre{total > 1 ? 's' : ''}</Text>}
    </View>
    {!local && onlineSource === 'mangadex' && counts && !query.trim() && <Text style={[styles.counts, { color: colors.textSecondary }]}>MangaDex : {counts.manga.toLocaleString('fr-FR')} mangas, {counts.manhwa.toLocaleString('fr-FR')} manhwas et {counts.manhua.toLocaleString('fr-FR')} manhuas avec des chapitres {language === 'all' ? 'dans au moins une langue' : `en ${languageName(language).toLowerCase()}`} (chiffres annoncés par MangaDex ; une œuvre compte une fois, quelles que soient ses traductions).</Text>}
    {!local && onlineSource === 'mangadex' && order !== 'added' && !query.trim() && total > WINDOW && <Text style={[styles.counts, { color: colors.textSecondary }]}>Ce tri s’arrête aux {WINDOW.toLocaleString('fr-FR')} premiers titres (limite de MangaDex). « Catalogue complet » parcourt tout, par ordre d’ajout.</Text>}
    {!!error && <TouchableOpacity accessibilityRole="button" accessibilityHint="Touchez pour réessayer" onPress={() => load(items.length, next)} style={{ paddingHorizontal: 16, paddingBottom: 12 }}><Text style={{ color: colors.error }}>{error} Réessayer</Text></TouchableOpacity>}
  </View>;

  return <View onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)} style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
    <PdfRenderHost />
    <View style={[styles.header, { paddingHorizontal: gutter }]}>
      <Text accessibilityRole="header" style={[typography.hero, { color: colors.text }]}>Scans</Text>
      {!local && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Langue préférée des chapitres : ${languageName(language)}. Changer`} onPress={chooseLanguage} style={[styles.languageButton, { borderColor: colors.border }]}><Ionicons name="language-outline" size={18} color={colors.text} /><Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{languageName(language)}</Text><Ionicons name="chevron-down" size={16} color={colors.textSecondary} /></TouchableOpacity>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { borderBottomColor: colors.border, marginHorizontal: gutter }]} contentContainerStyle={{ flexGrow: 1 }}>{SECTIONS.map(option => <TouchableOpacity key={option.key} accessibilityRole="tab" accessibilityState={{ selected: section === option.key }} onPress={() => { setSection(option.key); setTagIds([]); setStatus(undefined); setQuery(''); setSelecting(false); }} style={[styles.tab, { borderBottomColor: section === option.key ? colors.primary : 'transparent' }]}><Text style={{ fontWeight: '700', fontSize: 14, color: section === option.key ? colors.text : colors.textSecondary }}>{option.label}</Text></TouchableOpacity>)}</ScrollView>
    {!local && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0}} contentContainerStyle={[styles.chips, { paddingHorizontal: gutter }]}>{[['mangadex','MangaDex'],['scanmanga','Scan-Manga'],['poseidon','Poseidon Scans'],['online','Toutes les sources']].map(([id,label])=>chip(label,onlineSource===id,()=>selectSource(id),id))}</ScrollView>}
    <View style={[styles.searchRow, { paddingHorizontal: gutter }]}>
      <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="search-outline" size={20} color={colors.textSecondary} /><TextInput placeholder={searchLabel} accessibilityLabel={searchLabel} placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, color: colors.text, fontSize: 16 }} />{query.length > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => setQuery('')} hitSlop={hitSlopFor(20)}><Ionicons name="close-circle" size={20} color={colors.textSecondary} /></TouchableOpacity>}</View>
      {!local && <TouchableOpacity accessibilityRole="button" accessibilityLabel={activeCount ? `Filtres, ${activeCount} actif${activeCount > 1 ? 's' : ''}` : 'Filtres'} onPress={() => setSheet(true)} hitSlop={ICON_SLOP} style={styles.iconButton}><Ionicons name="options-outline" size={26} color={activeCount ? colors.primary : colors.text} /></TouchableOpacity>}
    </View>
    {!local && !query.trim() && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[styles.chips, { paddingHorizontal: gutter }]}>{ORDERS.filter(option=>!scanMangaUi||option.key!=='rating').map(option => chip(option.key === 'added' && scanMangaUi ? 'Œuvres indexées' : option.label, order === option.key, () => setOrder(option.key)))}</ScrollView>}
    <FlatList key={columns} data={groups} numColumns={columns} keyExtractor={group => `${group.comic.provider}-${group.comic.id}`} columnWrapperStyle={{ gap: 14, paddingHorizontal: gutter }} contentContainerStyle={{ paddingBottom: 24 }} style={{ flex: 1 }}
      ListHeaderComponent={header}
      renderItem={({ item: { comic: item, also } }) => <MotionPressable hoverScale={1.03} accessibilityLabel={`Ouvrir ${item.title}`} onPress={() => open(item)} style={{ width: cardWidth, marginBottom: 24 }}>{cover(item.coverThumb || also.find(other => other.coverThumb)?.coverThumb, cardWidth)}<Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.meta, { color: colors.textSecondary }]}>{local ? item.synopsis : [STATUS_LABELS[item.status], ...item.genres.slice(0, 2)].join(' · ')}</Text>{(also.length > 0 || item.provider !== onlineProvider.id) && !local && <Text numberOfLines={1} style={[styles.meta, { color: colors.primary }]}>{[item, ...also].map(sourceName).join(' + ')}</Text>}</MotionPressable>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : error ? undefined : <View style={styles.empty}><Ionicons name={local ? 'folder-open-outline' : 'book-outline'} size={42} color={colors.textSecondary} /><Text style={{ color: colors.text, fontSize: 18, marginTop: 14 }}>{local ? (server ? 'Aucune série sur ce serveur' : 'Aucun fichier importé') : 'Aucun titre trouvé'}</Text><Text style={{ color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>{local ? (server ? 'Vérifiez l’adresse du catalogue OPDS ou la recherche.' : 'Importez un CBZ, un ZIP d’images ou un PDF, ou ajoutez votre serveur OPDS (Komga, Kavita…).') : 'Essayez une autre recherche, d’autres filtres ou une autre langue.'}</Text></View>}
      ListFooterComponent={items.length > 0 && loading ? <ActivityIndicator color={colors.primary} style={{ margin: 20 }} /> : <Text style={{ color: colors.textTertiary, fontSize: 11, paddingHorizontal: gutter, paddingVertical: 16 }}>{provider.credit}</Text>}
      onEndReachedThreshold={0.6} onEndReached={() => { if (!loading && !error && canMore) void load(items.length, next); }}
    />
    <CustomModal visible={sheet} onRequestClose={() => setSheet(false)} alignment="bottom"><View style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
      <View style={styles.sheetHeader}><Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Filtres</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => setSheet(false)} hitSlop={ICON_SLOP} style={styles.iconButton}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity></View>
      <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity accessibilityRole="button" onPress={() => { setTagIds([]); setStatus(undefined); }}><Text style={{ color: colors.primary, marginBottom: 12 }}>Effacer les filtres</Text></TouchableOpacity>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Statut</Text>
        <View style={styles.wrap}>{chip('Tous', !status, () => setStatus(undefined))}{(['ongoing', 'completed', 'hiatus', 'cancelled'] as const).map(value => chip(STATUS_LABELS[value], status === value, () => setStatus(value)))}</View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Genres</Text>
        <View style={styles.wrap}>{tags.length ? tags.map(tag => chip(tag.name, tagIds.includes(tag.id), () => setTagIds(previous => previous.includes(tag.id) ? previous.filter(id => id !== tag.id) : [...previous, tag.id]), tag.id)) : <ActivityIndicator color={colors.primary} />}</View>
      </ScrollView>
      <TouchableOpacity accessibilityRole="button" onPress={() => setSheet(false)} style={[styles.apply, { backgroundColor: colors.buttonBg }]}><Text style={{ color: colors.buttonText, fontWeight: '700' }}>Voir les résultats</Text></TouchableOpacity>
    </View></CustomModal>
    <CustomModal visible={!!serverForm} onRequestClose={() => setServerForm(null)} alignment="bottom">{serverForm && <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: Math.max(insets.bottom, 16) }}>
      <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Ajouter un serveur OPDS</Text>
      <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>Votre propre bibliothèque (Komga, Kavita, Codex…), lue page par page sans téléchargement. Exemples d’adresse : Komga http://192.168.1.10:25600/opds/v1.2/catalog ; Kavita : l’adresse OPDS de votre profil (elle contient votre clé, laissez l’identifiant vide).</Text>
      {([['name', 'Nom (ex. : Maison)', false], ['url', 'Adresse du catalogue OPDS', false], ['username', 'Identifiant (facultatif)', false], ['password', 'Mot de passe (facultatif)', true]] as const).map(([field, label, secret]) =>
        <TextInput key={field} accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.textSecondary} secureTextEntry={secret} autoCapitalize="none" autoCorrect={false} value={serverForm[field]} onChangeText={value => setServerForm(form => form && { ...form, [field]: value })} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />)}
      <Text style={{ color: colors.textTertiary, fontSize: 12, lineHeight: 17 }}>Le mot de passe reste sur cet appareil (stockage sécurisé sur Android). Préférez un compte en lecture seule.</Text>
      {!!serverForm.error && <Text style={{ color: colors.error }}>{serverForm.error}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={serverForm.saving || !serverForm.url.trim()} onPress={() => void addServer()} style={[styles.apply, { marginHorizontal: 0, backgroundColor: colors.buttonBg, opacity: serverForm.saving || !serverForm.url.trim() ? 0.5 : 1 }]}>{serverForm.saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: colors.buttonText, fontWeight: '700' }}>Tester et enregistrer</Text>}</TouchableOpacity>
    </ScrollView>}</CustomModal>
    <CustomModal visible={!!sourceForm} onRequestClose={()=>setSourceForm(null)} alignment="bottom">{sourceForm && <View style={{padding:20,gap:12,paddingBottom:Math.max(insets.bottom,20)}}>
      <Text style={{color:colors.text,fontSize:21,fontWeight:'700'}}>Catalogue Scan-Manga</Text>
      <Text style={{color:colors.textSecondary}}>Adresse du service qui synchronise les œuvres et les nouveaux chapitres.</Text>
      <TextInput accessibilityLabel="Adresse du catalogue Scan-Manga" autoCapitalize="none" autoCorrect={false} value={sourceForm.address} onChangeText={address=>setSourceForm(form=>form && {...form,address})} placeholder="https://votre-serveur" placeholderTextColor={colors.textSecondary} style={[styles.input,{color:colors.text,borderColor:colors.border}]} />
      {!!sourceForm.error && <Text style={{color:colors.error}}>{sourceForm.error}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={sourceForm.saving||!sourceForm.address.trim()} onPress={()=>void saveSource()} style={[styles.apply,{backgroundColor:colors.buttonBg}]}>{sourceForm.saving?<ActivityIndicator color={colors.buttonText}/>:<Text style={{color:colors.buttonText,fontWeight:'700'}}>Tester et enregistrer</Text>}</TouchableOpacity>
      {textButton('Annuler',()=>setSourceForm(null))}
    </View>}</CustomModal>
    {undo && <UndoBar message={undo.message} onUndo={() => void restore(undo.ids)} onClose={() => setUndo(null)} />}
  </View>;
}

const styles = StyleSheet.create({
  header: { paddingTop: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabs: { flexGrow: 0, borderBottomWidth: 1, marginBottom: 12 }, tab: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 3 },
  languageButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  search: { flex: 1, maxWidth: 760, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderWidth: 1 },
  iconButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  chips: { gap: 8, paddingBottom: 12 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  counts: { fontSize: 12, lineHeight: 17, paddingHorizontal: 16, paddingBottom: 10 },
  input: { borderWidth: 1, borderRadius: radii.card, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingBottom: 14 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 4, paddingVertical: 8, borderRadius: radii.card, borderWidth: 1, marginBottom: 16 },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  badge: { position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600', marginTop: 10, lineHeight: 19 }, meta: { fontSize: 12, marginTop: 4 },
  placeholder: { borderRadius: radii.card, justifyContent: 'center', alignItems: 'center' },
  importBox: { marginHorizontal: 16, marginBottom: 8, padding: 16, gap: 10, borderRadius: radii.panel, borderWidth: 1 },
  importButton: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8, borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 11 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12, marginTop: 16 },
  apply: { borderRadius: radii.pill, marginHorizontal: 16, marginTop: 16, padding: 15, alignItems: 'center' },
});
