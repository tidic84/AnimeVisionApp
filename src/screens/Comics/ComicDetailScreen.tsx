import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackScreenProps } from '../../types/navigation';
import { useAppColorScheme } from '../../contexts/ThemeContext';
import { palette } from '../../theme/palette';
import { radii } from '../../theme/shape';
import AuthImage from '../../components/AuthImage';
import { dialog } from '../../components/Dialog';
import UndoBar from '../../components/UndoBar';
import { SkeletonBlock, SkeletonGroup } from '../../components/SkeletonCard/SkeletonCard';
import databaseService, { ComicProgress } from '../../services/databaseService';
import { getComicLanguage, saveComicLanguage } from '../../services/preferences';
import { Comic, ComicChapter, LanguageInfo, allProviders, chapterLabel, getChaptersCached, getLanguageInfoCached, getProvider } from '../../services/comics';
import { sameWork } from '../../services/comics/duplicates';
import { languageName, sortLanguages } from '../../services/comics/languages';
import { deleteLocalComic } from '../../services/comics/localLibrary';
import { STATUS_LABELS } from './ComicCatalogScreen';
import { pickEquivalentChapter } from './equivalentChapter';

type Availability = LanguageInfo | 'loading' | 'error';
const KIND_LABELS: Record<Comic['kind'], string> = { manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua' };

export default function ComicDetailScreen({ route, navigation }: RootStackScreenProps<'ComicDetail'>) {
  const { provider, comicId } = route.params;
  const source = getProvider(provider);
  const local = provider === 'local';
  // Sources traduites (MangaDex) : sélecteur de langue ; fichiers et serveurs : une seule version.
  const multilingual = !!source.getLanguageInfo;
  const colors = palette[useAppColorScheme() ?? 'dark'];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [comic, setComic] = useState<Comic | null>(null);
  // Langue retenue pour ce titre, sinon la préférence globale ; jamais changée sans action de l'utilisateur.
  const [language, setLanguage] = useState<string | null>(multilingual ? null : '');
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [allLanguages, setAllLanguages] = useState(false);
  const [chapters, setChapters] = useState<ComicChapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [error, setError] = useState('');
  const [chapterError, setChapterError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [positions, setPositions] = useState<ComicProgress[]>([]);
  const [hidden, setHidden] = useState(false);
  const [undo, setUndo] = useState('');
  const [descending, setDescending] = useState(false);
  // Même œuvre ailleurs (autres sources), avec leur dernier chapitre.
  const [others, setOthers] = useState<{ comic: Comic; last?: ComicChapter; count?: number }[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    setError('');
    source.getComic(comicId).then(item => { if (active) setComic(item); }).catch(failure => { if (active) setError(failure?.message || 'Ce titre ne peut pas être chargé.'); });
    void databaseService.isComicFavorite(comicId).then(value => { if (active) setFavorite(value); }).catch(() => {});
    return () => { active = false; };
  }, [comicId, attempt]);
  useEffect(() => {
    if (language === null || language === 'all') return;
    let active = true;
    setChaptersLoading(true); setChapterError('');
    getChaptersCached(provider, comicId, language, attempt > 0).then(list => { if (active) setChapters(list); })
      .catch(failure => { if (active) { setChapters([]); setChapterError(failure?.message || 'Les chapitres ne peuvent pas être chargés.'); } })
      .finally(() => { if (active) setChaptersLoading(false); });
    return () => { active = false; };
  }, [comicId, language, attempt]);
  const loadPositions = () => {
    void databaseService.getComicProgress(comicId).then(setPositions).catch(() => {});
    void databaseService.isComicHidden(comicId).then(setHidden).catch(() => {});
  };
  // Rafraîchi au retour du lecteur : chapitres lus et positions.
  useFocusEffect(useCallback(() => {
    // Langue choisie par l'utilisateur, éventuellement depuis le lecteur.
    if (multilingual) void getComicLanguage(comicId).then(setLanguage);
    void databaseService.getReadComicChapters(comicId).then(setRead).catch(() => {});
    loadPositions();
  }, [comicId]));

  // Langues annoncées par la source, vérifiées une à une (nombre de chapitres réellement lisibles et le dernier).
  // Préférence « toutes les langues » : première ouverture en français, sinon en anglais, sinon la première langue.
  useEffect(() => {
    if (language === 'all' && comic) setLanguage(['fr', 'en'].find(code => comic.languages.includes(code)) || comic.languages[0] || 'en');
  }, [language, comic]);
  useEffect(() => {
    if (!comic) return;
    let active = true;
    setOthers(null);
    (async () => {
      const found: { comic: Comic; last?: ComicChapter; count?: number }[] = [];
      for (const other of (await allProviders()).filter(item => item.id !== provider)) {
        const result = await other.search({ kind: 'all', query: comic.title, language: 'all', order: 'popular', offset: 0, limit: 10 }).catch(() => null);
        for (const match of result?.items.filter(item => sameWork(comic, item)) ?? []) {
          const chapters = other.getLanguageInfo ? [] : await getChaptersCached(match.provider, match.id, '').catch(() => []);
          const readable = chapters.filter(chapter => chapter.available);
          found.push({ comic: match, last: readable[readable.length - 1], count: other.getLanguageInfo ? undefined : readable.length });
        }
      }
      if (active) setOthers(found);
    })();
    return () => { active = false; };
  }, [comic?.id, comic?.title]);
  const announced = useMemo(() => !multilingual || !comic || language === null || language === 'all' ? [] : sortLanguages([...comic.languages, language, ...positions.map(row => row.language).filter(Boolean)], language), [comic, language, positions, multilingual]);
  const checked = allLanguages ? announced : announced.filter(code => code === language || code === 'fr' || code === 'en' || positions.some(row => row.language === code));
  useEffect(() => {
    for (const code of checked) {
      if (availability[code] && availability[code] !== 'error') continue;
      setAvailability(previous => ({ ...previous, [code]: 'loading' }));
      // Pas d'annulation : une réponse arrivée après un changement de liste reste valable (et en cache).
      getLanguageInfoCached(provider, comicId, code)
        .then(info => setAvailability(previous => ({ ...previous, [code]: info })))
        .catch(() => setAvailability(previous => ({ ...previous, [code]: 'error' })));
    }
  }, [checked.join(','), attempt]);

  const available = chapters.filter(chapter => chapter.available);
  const ordered = useMemo(() => descending ? [...chapters].reverse() : chapters, [chapters, descending]);
  const position = positions.find(row => (!multilingual || row.language === language) && row.provider === provider);
  const resume = position && chapters.some(chapter => chapter.id === position.chapterId) ? position : undefined;
  // Progression dans une autre traduction : proposée, jamais appliquée d'office.
  const elsewhere = !multilingual ? undefined : positions.find(row => row.language !== language && row.provider === provider);
  const nextUnread = available.find(chapter => !read.has(chapter.id)) || available[0];

  const chooseLanguage = (code: string) => { setLanguage(code); void saveComicLanguage(code, comicId); };
  const openChapter = (chapter: ComicChapter) => {
    if (language === null) return;
    if (!chapter.available) { if (chapter.externalUrl) void Linking.openURL(chapter.externalUrl); return; }
    navigation.navigate('ComicReader', { provider, comicId, chapterId: chapter.id, language, page: 0 });
  };
  const continueHere = async (row: ComicProgress) => {
    if (!language) return;
    const previous = (await getChaptersCached(provider, comicId, row.language).catch(() => [] as ComicChapter[])).find(chapter => chapter.id === row.chapterId)
      ?? { id: row.chapterId, number: row.chapterNumber, title: '', language: row.language, pages: row.pageCount, available: true };
    const target = await pickEquivalentChapter(provider, comicId, previous, language);
    if (target) navigation.navigate('ComicReader', { provider, comicId, chapterId: target.id, language, page: 0 });
  };
  const toggleFavorite = async () => {
    if (!comic) return;
    const next = !favorite;
    setFavorite(next);
    try { await databaseService.setComicFavorite(comic, next); } catch { setFavorite(!next); }
  };
  const setInProgress = async (hide: boolean) => {
    setHidden(hide);
    try { await databaseService.setComicsHidden([comicId], hide); if (hide) setUndo(`« ${comic?.title} » retiré de « En cours »`); } catch { setHidden(!hide); }
  };
  const resetProgress = async () => {
    const confirmed = await dialog.confirm({ title: 'Réinitialiser la progression ?', message: 'Les positions de lecture (toutes langues) et les chapitres lus de ce titre seront effacés. Cette action ne peut pas être annulée. Les favoris et les fichiers importés sont conservés.', buttons: [{ text: 'Annuler', style: 'cancel', value: false }, { text: 'Réinitialiser', style: 'destructive', value: true }] });
    if (!confirmed) return;
    await databaseService.resetComicProgress(comicId).catch(() => setError('La réinitialisation a échoué.'));
    setRead(new Set()); loadPositions();
  };
  const remove = async () => {
    const confirmed = await dialog.confirm({ title: 'Supprimer ce fichier ?', message: 'Les pages importées et la progression de lecture seront effacées de cet appareil.', buttons: [{ text: 'Annuler', style: 'cancel', value: false }, { text: 'Supprimer', style: 'destructive', value: true }] });
    if (!confirmed) return;
    try { await deleteLocalComic(comicId); await databaseService.forgetComic(comicId); navigation.goBack(); } catch { setError('La suppression a échoué.'); }
  };
  const changeKind = async () => {
    if (!comic) return;
    const kind = comic.kind === 'manga' ? 'manhwa' : 'manga';
    await source.setKind?.(comicId, kind);
    setComic({ ...comic, kind });
  };

  if (error) return <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
    <Text style={[styles.message, { color: colors.text }]}>{error}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={[styles.primary, { backgroundColor: colors.buttonBg }]}><Text style={styles.primaryText}>Réessayer</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()} style={{ padding: 14 }}><Text style={{ color: colors.primary }}>Retour</Text></TouchableOpacity>
  </View>;
  if (!comic) {
    const skeletonCover = wide ? 220 : 140;
    return <View accessibilityLabel="Chargement du titre" style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <SkeletonGroup><View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: 16 }}>
        <View style={[styles.top, !wide && { flexDirection: 'column', alignItems: 'center' }]}>
          <SkeletonBlock width={skeletonCover} height={skeletonCover * 1.45} />
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 12, alignItems: wide ? 'flex-start' : 'center' }}>
            <SkeletonBlock width="70%" height={30} /><SkeletonBlock width="45%" height={14} /><SkeletonBlock width={200} height={44} />
          </View>
        </View>
        <View style={{ gap: 10, marginTop: 22 }}><SkeletonBlock height={14} /><SkeletonBlock height={14} /><SkeletonBlock width="80%" height={14} /></View>
        <View style={{ gap: 14, marginTop: 30 }}>{[0, 1, 2, 3, 4].map(key => <SkeletonBlock key={key} height={40} />)}</View>
      </View></SkeletonGroup>
    </View>;
  }

  const coverWidth = wide ? 220 : 140;
  const languageLabel = language ? languageName(language) : '';
  const secondary = (icon: React.ComponentProps<typeof Ionicons>['name'], label: string, onPress: () => void, color = colors.text, a11y = label) =>
    <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={[styles.secondary, { borderColor: colors.border }]}><Ionicons name={icon} size={19} color={color} /><Text style={{ color }}>{label}</Text></TouchableOpacity>;

  // Sélecteur : seulement les langues vérifiées avec au moins un chapitre lisible (plus la langue choisie).
  const unverified = announced.filter(code => !checked.includes(code));
  const languageChip = (code: string) => {
    const info = availability[code];
    if (info && typeof info === 'object' && info.count === 0 && code !== language) return null;
    const active = code === language;
    const detail = info === 'loading' || !info ? 'vérification…' : info === 'error' ? 'non vérifiée' : info.count === 0 ? 'aucun chapitre lisible' : info.last?.number ? `jusqu’au ch. ${info.last.number}` : 'chapitres lisibles';
    return <TouchableOpacity key={code} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`${languageName(code)}, ${detail}`} onPress={() => chooseLanguage(code)}
      style={[styles.language, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '22' : colors.surface }]}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{languageName(code)}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{detail}</Text>
    </TouchableOpacity>;
  };
  const currentInfo = language ? availability[language] : undefined;

  const header = <View style={{ paddingHorizontal: 16 }}>
    <View style={[styles.top, !wide && { flexDirection: 'column', alignItems: 'center' }]}>
      {comic.cover ? <AuthImage uri={comic.cover} accessibilityLabel={`Couverture de ${comic.title}`} style={{ width: coverWidth, height: coverWidth * 1.45, borderRadius: radii.card, backgroundColor: colors.surface }} resizeMode="cover" /> : <View style={[styles.cover, { width: coverWidth, height: coverWidth * 1.45, backgroundColor: colors.surface }]}><Ionicons name="book-outline" size={40} color={colors.textSecondary} /></View>}
      <View style={{ flex: wide ? 1 : undefined, gap: 10, alignItems: wide ? 'flex-start' : 'center' }}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text, textAlign: wide ? 'left' : 'center' }]}>{comic.title}</Text>
        <Text style={{ color: colors.textSecondary, textAlign: wide ? 'left' : 'center' }}>{[KIND_LABELS[comic.kind], comic.status !== 'unknown' && STATUS_LABELS[comic.status], comic.year, !local && `Source : ${source.name}`].filter(Boolean).join(' · ')}</Text>
        {comic.genres.length > 0 && <View style={[styles.wrap, !wide && { justifyContent: 'center' }]}>{comic.genres.map(genre => <View key={genre} style={[styles.tag, { backgroundColor: colors.surface }]}><Text style={{ color: colors.text, fontSize: 12 }}>{genre}</Text></View>)}</View>}
        <View style={[styles.actions, !wide && { justifyContent: 'center' }]}>
          {chaptersLoading ? <ActivityIndicator color={colors.primary} /> : resume ? <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('ComicReader', { provider, comicId, chapterId: resume.chapterId, language: language!, page: resume.page, offset: resume.offset })} style={[styles.primary, { backgroundColor: colors.buttonBg }]}><Ionicons name="play" size={18} color="#fff" /><Text style={styles.primaryText}>Reprendre · {resume.chapterNumber ? `ch. ${resume.chapterNumber} ` : ''}p. {resume.page + 1}</Text></TouchableOpacity>
            : nextUnread ? <TouchableOpacity accessibilityRole="button" onPress={() => openChapter(nextUnread)} style={[styles.primary, { backgroundColor: colors.buttonBg }]}><Ionicons name="book" size={18} color="#fff" /><Text style={styles.primaryText}>{read.size ? 'Continuer' : 'Commencer'}{local ? '' : ` · ${chapterLabel(nextUnread)}`}</Text></TouchableOpacity> : null}
          {secondary(favorite ? 'heart' : 'heart-outline', favorite ? 'Favori' : 'Ajouter aux favoris', toggleFavorite, favorite ? colors.danger : colors.text, favorite ? 'Retirer des favoris' : 'Ajouter aux favoris')}
          {positions.length > 0 && !hidden && secondary('eye-off-outline', 'Retirer de « En cours »', () => void setInProgress(true), colors.text, 'Retirer de la section En cours, la progression est gardée')}
          {positions.length > 0 && hidden && <Text style={{ color: colors.textSecondary, fontSize: 12, alignSelf: 'center' }}>Masqué de « En cours » (réapparaît à la prochaine lecture)</Text>}
          {(positions.length > 0 || read.size > 0) && secondary('refresh-outline', 'Réinitialiser la progression', resetProgress, colors.danger)}
          {!!source.setKind && secondary('swap-vertical', comic.kind === 'manga' ? 'Lu comme un manga' : 'Lu comme un manhwa', changeKind, colors.text, comic.kind === 'manga' ? 'Lire comme un manhwa, en défilement vertical' : 'Lire comme un manga, page par page')}
          {local && secondary('trash-outline', 'Supprimer le fichier', remove, colors.danger, 'Supprimer ce fichier importé')}
        </View>
      </View>
    </View>
    {!!comic.synopsis && <TouchableOpacity accessibilityRole="button" accessibilityHint={expanded ? 'Réduire le résumé' : 'Afficher tout le résumé'} onPress={() => setExpanded(value => !value)} activeOpacity={0.8}><Text numberOfLines={expanded ? undefined : 5} style={[styles.synopsis, { color: colors.textSecondary }]}>{comic.synopsis}</Text></TouchableOpacity>}
    {!comic.synopsis && <Text style={[styles.synopsis, { color: colors.textTertiary }]}>Aucun résumé disponible.</Text>}

    {others && others.length > 0 && <View style={{ marginTop: 22, gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Aussi disponible</Text>
      {others.map(other => <TouchableOpacity key={`${other.comic.provider}-${other.comic.id}`} accessibilityRole="button" onPress={() => navigation.push('ComicDetail', { provider: other.comic.provider, comicId: other.comic.id })} style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{getProvider(other.comic.provider).name}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{other.count === undefined ? `Langues : ${other.comic.languages.map(code => code.toUpperCase()).join(', ') || '?'}` : other.count ? `${other.count} document${other.count > 1 ? 's' : ''} · jusqu’à : ${other.last ? chapterLabel(other.last) : '?'}` : 'Aucun document lisible'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>)}
    </View>}

    {multilingual && <View style={{ marginTop: 22, gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Langue des chapitres</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>Traductions publiées sur {source.name} par des équipes de traduction (pas de traduction automatique). Seules les langues ayant des chapitres lisibles sont proposées.</Text>
      <View style={styles.wrap}>{checked.map(languageChip)}
        {unverified.length > 0 && <TouchableOpacity accessibilityRole="button" onPress={() => setAllLanguages(true)} style={[styles.language, { borderColor: colors.border, justifyContent: 'center' }]}><Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Autres langues ({unverified.length})</Text></TouchableOpacity>}
      </View>
      {elsewhere && <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.text, lineHeight: 20 }}>Vous lisiez en {languageName(elsewhere.language).toLowerCase()} : {elsewhere.chapterNumber ? `chapitre ${elsewhere.chapterNumber}` : 'chapitre sans numéro'}, page {elsewhere.page + 1}. Chaque langue garde sa propre progression.</Text>
        <View style={styles.wrap}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('ComicReader', { provider, comicId, chapterId: elsewhere.chapterId, language: elsewhere.language, page: elsewhere.page, offset: elsewhere.offset })} style={[styles.secondary, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>Reprendre en {languageName(elsewhere.language).toLowerCase()}</Text></TouchableOpacity>
          {available.length > 0 && <TouchableOpacity accessibilityRole="button" onPress={() => void continueHere(elsewhere)} style={[styles.secondary, { borderColor: colors.primary }]}><Text style={{ color: colors.primary }}>Continuer en {languageLabel.toLowerCase()} au chapitre équivalent</Text></TouchableOpacity>}
        </View>
      </View>}
    </View>}

    <View style={styles.listHeader}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', flex: 1 }}>{chapters.length} {multilingual ? 'chapitre' : 'document'}{chapters.length > 1 ? 's' : ''}{multilingual ? ` · ${languageLabel}` : ''}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={descending ? 'Trier du premier au dernier' : 'Trier du dernier au premier'} onPress={() => setDescending(value => !value)} style={{ padding: 10 }}><Ionicons name={descending ? 'arrow-up' : 'arrow-down'} size={20} color={colors.text} /></TouchableOpacity>
    </View>
    {!!chapterError && <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)}><Text style={{ color: colors.error, paddingVertical: 10 }}>{chapterError} Réessayer</Text></TouchableOpacity>}
    {!chaptersLoading && !chapterError && available.length === 0 && <Text style={{ color: colors.textSecondary, paddingVertical: 14, lineHeight: 20 }}>{multilingual ? `Aucun chapitre lisible en ${languageLabel.toLowerCase()} pour ce titre${typeof currentInfo === 'object' && currentInfo.count === 0 ? '' : ' (souvent retiré à la demande de l’éditeur)'}. Choisissez une autre langue ci-dessus.` : 'Aucun document lisible (le serveur ne propose pas la lecture page par page pour ce titre).'}</Text>}
    {chaptersLoading && <ActivityIndicator color={colors.primary} style={{ margin: 20 }} />}
  </View>;

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={[styles.bar, { paddingTop: insets.top }]}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" onPress={() => navigation.goBack()} style={{ padding: 10 }}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity></View>
    <FlatList data={chaptersLoading ? [] : ordered} keyExtractor={item => item.id} ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: 30 + insets.bottom, width: '100%', maxWidth: 1100, alignSelf: 'center' }}
      initialNumToRender={30} windowSize={7}
      renderItem={({ item }) => {
        const done = read.has(item.id);
        const current = resume?.chapterId === item.id;
        return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${chapterLabel(item)}${item.title && item.number ? `, ${item.title}` : ''}${done ? ', lu' : ''}${item.available ? '' : item.externalUrl ? ', disponible chez l’éditeur' : ', indisponible'}`} disabled={!item.available && !item.externalUrl} onPress={() => openChapter(item)} style={[styles.chapter, { borderBottomColor: colors.border, opacity: item.available || item.externalUrl ? 1 : 0.5 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: done ? colors.textSecondary : colors.text, fontSize: 15, fontWeight: current ? '700' : '500' }} numberOfLines={1}>{chapterLabel(item)}{item.title && item.number ? ` — ${item.title}` : ''}</Text>
            <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 3 }} numberOfLines={1}>{[item.volume && `Vol. ${item.volume}`, item.group, item.pages ? `${item.pages} pages` : '', item.publishedAt && new Date(item.publishedAt).toLocaleDateString('fr-FR'), !item.available && (item.externalUrl ? 'Lecture chez l’éditeur ↗' : 'Indisponible')].filter(Boolean).join(' · ')}</Text>
          </View>
          {current ? <Text style={{ color: colors.primary, fontSize: 12 }}>p. {resume!.page + 1}/{resume!.pageCount}</Text> : done ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
        </TouchableOpacity>;
      }}
      ListFooterComponent={<Text style={{ color: colors.textTertiary, fontSize: 12, padding: 16, lineHeight: 18 }}>{source.credit}</Text>}
    />
    {!!undo && <UndoBar message={undo} onUndo={() => void setInProgress(false)} onClose={() => setUndo('')} />}
  </View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  message: { textAlign: 'center', fontSize: 16, lineHeight: 22 },
  bar: { position: 'absolute', zIndex: 2, left: 4 },
  top: { flexDirection: 'row', gap: 22, paddingTop: 64, alignItems: 'flex-start' },
  cover: { borderRadius: radii.card, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 12 },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1 },
  synopsis: { fontSize: 14, lineHeight: 21, marginTop: 18 },
  language: { borderWidth: 1, borderRadius: radii.card, paddingHorizontal: 12, paddingVertical: 8, minWidth: 120 },
  notice: { borderWidth: 1, borderRadius: radii.panel, padding: 14, gap: 10 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 6 },
  chapter: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
});
