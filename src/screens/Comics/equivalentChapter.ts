// Changement de traduction en cours de lecture : propose le chapitre équivalent, ou explique pourquoi c'est incertain
// et laisse choisir. Le chapitre choisi s'ouvre toujours à la première page (pas de transfert de position).
import { dialog } from '../../components/Dialog';
import { ComicChapter, chapterLabel, getChaptersCached, getProvider } from '../../services/comics';
import { findEquivalentChapter } from '../../services/comics/chapterMatch';
import { languageName } from '../../services/comics/languages';

const describe = (chapter: ComicChapter) => [chapterLabel(chapter), chapter.title && chapter.number ? chapter.title : '', chapter.volume && `vol. ${chapter.volume}`, chapter.group].filter(Boolean).join(' · ');

/** Chapitre à ouvrir dans `language`, ou null si l'utilisateur renonce. */
export async function pickEquivalentChapter(provider: string, comicId: string, current: ComicChapter, language: string): Promise<ComicChapter | null> {
  const name = languageName(language).toLowerCase();
  let targets: ComicChapter[];
  try { targets = await getChaptersCached(provider, comicId, language); } catch (failure: any) {
    dialog.alert('Chapitres indisponibles', failure?.message || `Les chapitres en ${name} ne peuvent pas être chargés.`);
    return null;
  }
  const match = findEquivalentChapter(current, targets, name);
  const note = 'Il s’ouvrira à la première page : une page d’une traduction ne correspond pas forcément à celle d’une autre.';
  if (match.kind === 'exact') {
    const ok = await dialog.confirm({ title: `Continuer en ${name}`, message: `${describe(match.chapter)} — source : ${getProvider(provider).name}.\n${note}`, buttons: [{ text: 'Annuler', style: 'cancel', value: false }, { text: 'Ouvrir', value: true }] });
    return ok ? match.chapter : null;
  }
  if (!match.candidates.length) { dialog.alert(`Pas de version en ${name}`, match.reason); return null; }
  const id = await dialog.actions({
    title: match.kind === 'uncertain' ? 'Correspondance incertaine' : 'Chapitre introuvable',
    subtitle: `${match.reason}\nChoisissez le chapitre à ouvrir. ${note}`,
    actions: match.candidates.map(chapter => ({ label: describe(chapter), value: chapter.id, icon: 'book-outline' as const })),
  });
  return match.candidates.find(chapter => chapter.id === id) ?? null;
}
